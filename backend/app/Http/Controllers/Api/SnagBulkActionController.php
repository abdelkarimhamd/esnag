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
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class SnagBulkActionController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
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
            'due_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $updatesAssignment = array_key_exists('assigned_to', $validated);
        $updatesDueDate = array_key_exists('due_date', $validated);
        if (! $updatesAssignment && ! $updatesDueDate) {
            abort(422, 'Provide at least one bulk field: assigned_to or due_date.');
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

        if ($updatesAssignment && $validated['assigned_to']) {
            $assignee = User::query()->findOrFail((int) $validated['assigned_to']);
            if (! $assignee->organizations()->where('organizations.id', $organization->id)->where('organization_user.is_active', true)->exists()) {
                abort(422, 'Assignee is not an active member of this organization.');
            }
        }

        foreach ($snags as $snag) {
            if ($snag->project?->is_training && $snag->project?->training_locked) {
                abort(423, 'Training project is read-only. Switch to a live project to apply changes.');
            }
        }

        $updatedIds = [];

        foreach ($snags as $snag) {
            if ($updatesAssignment) {
                $snag->assigned_to = $validated['assigned_to'] ?? null;

                if ($snag->assigned_to && $snag->status === SnagStatus::New->value) {
                    $snag->status = SnagStatus::Assigned->value;
                    $snag->acknowledged_at = $snag->acknowledged_at ?: now();
                }
            }

            if ($updatesDueDate) {
                $snag->due_date = $validated['due_date'] ?? null;
            }

            $snag->save();
            $updatedIds[] = $snag->id;
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
