<?php

namespace App\Http\Controllers\Api;

use App\Enums\SnagStatus;
use App\Events\ExportRequested;
use App\Events\ExportRealtimeMessage;
use App\Events\SnagRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\ExportJob;
use App\Models\Snag;
use App\Models\SnagStatusHistory;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Services\AccessControlService;
use App\Services\AuditRecorder;
use App\Services\SnagTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SnagBulkActionController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly SnagTransitionService $snagTransitionService,
        private readonly AuditRecorder $auditRecorder,
    ) {
    }

    public function update(Request $request): JsonResponse
    {
        if (! $request->user()->can('snags.update')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'snag_ids' => ['required', 'array', 'min:1', 'max:300'],
            'snag_ids.*' => ['integer', 'distinct', 'exists:snags,id'],
            'assigned_to' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'assigned_company_id' => ['sometimes', 'nullable', 'integer', 'exists:stakeholder_companies,id'],
            'assigned_team_id' => ['sometimes', 'nullable', 'integer', 'exists:stakeholder_teams,id'],
            'assignment_reason' => ['nullable', 'string', 'max:2000'],
            'due_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $updatesAssignee = array_key_exists('assigned_to', $validated);
        $updatesCompany = array_key_exists('assigned_company_id', $validated);
        $updatesTeam = array_key_exists('assigned_team_id', $validated);
        $updatesAssignment = $updatesAssignee || $updatesCompany || $updatesTeam;
        $updatesDueDate = array_key_exists('due_date', $validated);
        if (! $updatesAssignment && ! $updatesDueDate) {
            abort(422, 'Provide at least one bulk field: assigned_to, assigned_company_id, assigned_team_id or due_date.');
        }

        $snags = $this->loadOrganizationSnags($organization->id, $validated['snag_ids']);
        $requiredPermissions = [];
        if ($updatesAssignment) {
            $requiredPermissions[] = 'snags.assign';
        }
        if ($updatesDueDate) {
            $requiredPermissions[] = 'snags.update';
        }

        $this->assertScopedPermissions($request, $organization->id, $snags, $requiredPermissions);

        if ($updatesAssignee && $validated['assigned_to']) {
            $assignee = User::query()->findOrFail((int) $validated['assigned_to']);
            if (! $assignee->organizations()->where('organizations.id', $organization->id)->where('organization_user.is_active', true)->exists()) {
                abort(422, 'Assignee is not an active member of this organization.');
            }
        }

        $company = null;
        if ($updatesCompany && $validated['assigned_company_id']) {
            $company = StakeholderCompany::query()->findOrFail((int) $validated['assigned_company_id']);
            if ($company->organization_id !== $organization->id) {
                abort(422, 'Selected company does not belong to this organization.');
            }
        }

        $team = null;
        if ($updatesTeam && $validated['assigned_team_id']) {
            $team = StakeholderTeam::query()->findOrFail((int) $validated['assigned_team_id']);
            if ($team->organization_id !== $organization->id) {
                abort(422, 'Selected team does not belong to this organization.');
            }
        }

        $reason = trim((string) ($validated['assignment_reason'] ?? ''));

        // BR-BR-007: a project-pinned team may only be assigned to snags within that project.
        // Organization-wide teams (project_id === null) may be assigned anywhere.
        if ($team && $team->project_id !== null) {
            foreach ($snags as $snag) {
                if ((int) $snag->project_id !== (int) $team->project_id) {
                    abort(422, 'Selected team is not available for one or more of the selected projects.');
                }
            }
        }

        // BR-FR-016: a mandatory reason is required on a true re-assignment — a snag that already
        // had an assignee/company/team whose assignment is now changing. First-time assignment
        // across the batch does not require a reason.
        if ($updatesAssignment && $reason === '') {
            foreach ($snags as $snag) {
                $hadPriorAssignment = $snag->assigned_to !== null
                    || $snag->assigned_company_id !== null
                    || $snag->assigned_team_id !== null;

                $nextAssignee = $updatesAssignee ? ($validated['assigned_to'] ?? null) : $snag->assigned_to;
                $nextCompany = $updatesCompany ? $company?->id : $snag->assigned_company_id;
                $nextTeam = $updatesTeam ? $team?->id : $snag->assigned_team_id;

                $assignmentChanged = (int) $nextAssignee !== (int) $snag->assigned_to
                    || (int) $nextCompany !== (int) $snag->assigned_company_id
                    || (int) $nextTeam !== (int) $snag->assigned_team_id;

                if ($hadPriorAssignment && $assignmentChanged) {
                    abort(422, 'A reason is required when reassigning one or more snags that already have an assignee, company, or team.');
                }
            }
        }

        foreach ($snags as $snag) {
            if ($snag->project?->is_training && $snag->project?->training_locked) {
                abort(423, 'Training project is read-only. Switch to a live project to apply changes.');
            }
        }

        $updatedIds = [];

        foreach ($snags as $snag) {
            $prevAssignee = $snag->assigned_to;
            $prevCompany = $snag->assigned_company_id;
            $prevTeam = $snag->assigned_team_id;

            if ($updatesAssignee) {
                $snag->assigned_to = $validated['assigned_to'] ?? null;
            }
            if ($updatesCompany) {
                $snag->assigned_company_id = $company?->id;
            }
            if ($updatesTeam) {
                $snag->assigned_team_id = $team?->id;
            }

            if ($updatesAssignment
                && ($snag->assigned_to || $snag->assigned_company_id || $snag->assigned_team_id)
                && $snag->status === SnagStatus::New->value
            ) {
                $snag->status = SnagStatus::Assigned->value;
                $snag->acknowledged_at = $snag->acknowledged_at ?: now();
            }

            if ($updatesDueDate) {
                $snag->due_date = $validated['due_date'] ?? null;
            }

            $snag->save();
            $updatedIds[] = $snag->id;

            $assignmentChanged = $updatesAssignment && (
                $prevAssignee !== $snag->assigned_to
                || $prevCompany !== $snag->assigned_company_id
                || $prevTeam !== $snag->assigned_team_id
            );

            if ($assignmentChanged) {
                $from = ['assigned_to' => $prevAssignee, 'assigned_company_id' => $prevCompany, 'assigned_team_id' => $prevTeam];
                $to = ['assigned_to' => $snag->assigned_to, 'assigned_company_id' => $snag->assigned_company_id, 'assigned_team_id' => $snag->assigned_team_id];

                SnagStatusHistory::create([
                    'snag_id' => $snag->id,
                    'organization_id' => $organization->id,
                    'from_status' => $snag->status,
                    'to_status' => $snag->status,
                    'changed_by' => $request->user()->id,
                    'note' => $reason !== '' ? $reason : 'Bulk assignment updated.',
                    'metadata' => [
                        'event' => 'reassignment',
                        'reason' => $reason !== '' ? $reason : null,
                        'from' => $from,
                        'to' => $to,
                    ],
                ]);

                // Item 9 (BR-BR-013): mirror each bulk reassignment into the unified audit stream.
                $this->auditRecorder->record(
                    $organization->id,
                    $request->user(),
                    'snag.reassigned',
                    $snag,
                    $snag->project_id,
                    $from,
                    $to,
                    $reason !== '' ? $reason : null,
                    ['bulk' => true],
                );
            }
        }

        event(new SnagRealtimeMessage($organization->id, [
            'action' => 'bulk_updated',
            'snag_ids' => $updatedIds,
            'count' => count($updatedIds),
        ]));

        return response()->json([
            'data' => [
                'updated_count' => count($updatedIds),
                'snag_ids' => $updatedIds,
            ],
        ]);
    }

    /**
     * Bulk lifecycle transition. Each snag goes through the same
     * SnagTransitionService as a single transition (workflow validation,
     * closeout gate, DLP rules, history, automation), so an invalid snag is
     * reported per-row instead of failing the whole batch.
     */
    public function transition(Request $request): JsonResponse
    {
        if (! $request->user()->can('snags.transition')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'snag_ids' => ['required', 'array', 'min:1', 'max:300'],
            'snag_ids.*' => ['integer', 'distinct', 'exists:snags,id'],
            'to_status' => ['required', Rule::in(array_map(fn (SnagStatus $status) => $status->value, SnagStatus::cases()))],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $snags = $this->loadOrganizationSnags($organization->id, $validated['snag_ids']);
        $this->assertScopedPermissions($request, $organization->id, $snags, ['snags.transition']);

        foreach ($snags as $snag) {
            if ($snag->project?->is_training && $snag->project?->training_locked) {
                abort(423, 'Training project is read-only. Switch to a live project to apply changes.');
            }
        }

        $results = [];
        $transitionedIds = [];

        foreach ($snags as $snag) {
            try {
                $this->snagTransitionService->transition(
                    $snag,
                    $request->user(),
                    $validated['to_status'],
                    $validated['note'] ?? null,
                );
                $results[] = ['snag_id' => $snag->id, 'ok' => true];
                $transitionedIds[] = $snag->id;
            } catch (ValidationException $exception) {
                $results[] = [
                    'snag_id' => $snag->id,
                    'ok' => false,
                    'error' => collect($exception->errors())->flatten()->first() ?? 'Invalid transition.',
                ];
            }
        }

        if ($transitionedIds !== []) {
            event(new SnagRealtimeMessage($organization->id, [
                'action' => 'bulk_updated',
                'snag_ids' => $transitionedIds,
                'count' => count($transitionedIds),
            ]));
        }

        return response()->json([
            'data' => [
                'transitioned_count' => count($transitionedIds),
                'results' => $results,
            ],
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        if (! $request->user()->can('exports.request')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'type' => ['required', 'in:pdf,csv,xlsx'],
            'snag_ids' => ['required', 'array', 'min:1', 'max:500'],
            'snag_ids.*' => ['integer', 'distinct', 'exists:snags,id'],
            'filters' => ['nullable', 'array'],
        ]);

        $snags = $this->loadOrganizationSnags($organization->id, $validated['snag_ids']);
        $this->assertScopedPermissions($request, $organization->id, $snags, ['snags.view']);

        $filters = $validated['filters'] ?? [];
        $filters['module'] = 'snags';
        $filters['snag_ids'] = $snags->pluck('id')->values()->all();

        $exportJob = ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $request->user()->id,
            'project_id' => null,
            'type' => $validated['type'],
            'status' => 'queued',
            'filters' => $filters,
            'download_token' => Str::random(40),
        ]);

        event(new ExportRequested($exportJob));
        event(new ExportRealtimeMessage($organization->id, [
            'action' => 'bulk_export_requested',
            'export_job_id' => $exportJob->id,
            'status' => $exportJob->status,
            'type' => $exportJob->type,
        ]));

        return response()->json([
            'data' => $exportJob->fresh(['requester:id,name,email', 'project:id,name,code']),
        ], 201);
    }

    /**
     * @param  array<int, int>  $snagIds
     * @return Collection<int, Snag>
     */
    private function loadOrganizationSnags(int $organizationId, array $snagIds): Collection
    {
        $snags = Snag::query()
            ->where('organization_id', $organizationId)
            ->whereIn('id', $snagIds)
            ->with('project:id,is_training,training_locked')
            ->get();

        if ($snags->count() !== count(array_unique($snagIds))) {
            abort(422, 'One or more snags do not belong to the active organization.');
        }

        return $snags;
    }

    /**
     * @param  array<int, string>  $requiredPermissions
     */
    private function assertScopedPermissions(Request $request, int $organizationId, Collection $snags, array $requiredPermissions): void
    {
        $projectIds = $snags->pluck('project_id')->filter()->unique()->values()->all();

        foreach ($projectIds as $projectId) {
            foreach ($requiredPermissions as $permission) {
                if ($this->accessControlService->allows($request->user(), $organizationId, (int) $projectId, $permission)) {
                    continue;
                }

                $message = match ($permission) {
                    'snags.assign' => 'You do not have permission to bulk assign snags for one or more selected projects.',
                    'snags.update' => 'You do not have permission to update snags for one or more selected projects.',
                    default => 'You do not have permission for one or more selected projects.',
                };

                abort(403, $message);
            }
        }
    }
}
