<?php

namespace App\Http\Controllers\Api;

use App\Enums\SnagStatus;
use App\Events\SnagCreated;
use App\Events\SnagRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Area;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\DrawingRevision;
use App\Models\Equipment;
use App\Models\Floor;
use App\Models\HandoverRequest;
use App\Models\InspectionSubmission;
use App\Models\Location;
use App\Models\Project;
use App\Models\RootCauseCategory;
use App\Models\Snag;
use App\Models\SnagCategory;
use App\Models\SnagStatusHistory;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\TakingOverCertificate;
use App\Models\User;
use App\Notifications\SnagAssignedNotification;
use App\Services\AccessControlService;
use App\Services\AuditRecorder;
use App\Services\CloseoutService;
use App\Services\SnagCollaborationService;
use App\Services\WorkflowAutomationService;
use App\Support\SnagWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SnagController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly CloseoutService $closeoutService,
        private readonly SnagCollaborationService $snagCollaborationService,
        private readonly WorkflowAutomationService $workflowAutomationService,
        private readonly AuditRecorder $auditRecorder,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Snag::class);

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $allowedSort = ['created_at', 'priority', 'status', 'due_date'];
        $sortBy = in_array($request->string('sort_by')->toString(), $allowedSort, true)
            ? $request->string('sort_by')->toString()
            : 'created_at';
        $sortDirection = $request->string('sort_direction')->lower()->toString() === 'asc' ? 'asc' : 'desc';

        $query = Snag::query()
            ->where('organization_id', $organization->id)
            ->with([
                'project:id,name,code',
                'drawing:id,title,code,current_revision_id',
                'drawingRevision:id,drawing_id,revision_label,file_name,mime_type,file_size,is_current',
                'area:id,name,code',
                'rootCauseCategory:id,name,code',
                'category:id,name,code',
                'sourceOrganization:id,name,code,type',
                'equipment:id,name,code,status,barcode',
                'assignee:id,name,email',
                'assignedCompany:id,name,code,type',
                'assignedTeam:id,name,code,project_id,company_id',
                'dispatchRecipient:id,name,email',
                'creator:id,name,email',
            ]);

        foreach (['project_id', 'drawing_id', 'drawing_revision_id', 'building_id', 'area_id', 'floor_id', 'location_id', 'root_cause_category_id', 'category_id', 'source_organization_id', 'inspection_submission_id', 'assigned_to', 'equipment_id', 'assigned_company_id', 'assigned_team_id', 'dispatched_to'] as $filter) {
            if ($value = $request->integer($filter)) {
                $query->where($filter, $value);
            }
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($priority = $request->string('priority')->toString()) {
            $query->where('priority', $priority);
        }

        if ($severity = $request->string('severity')->toString()) {
            $query->where('severity', $severity);
        }

        if ($snagType = $request->string('snag_type')->toString()) {
            $query->where('snag_type', $snagType);
        }

        if ($trade = $request->string('trade')->toString()) {
            $query->where('trade', $trade);
        }

        if ($request->has('is_dlp') && $request->input('is_dlp') !== '') {
            $query->where('is_dlp', $request->boolean('is_dlp'));
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('reference', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $snags = $query
            ->orderBy($sortBy, $sortDirection)
            ->paginate($perPage);

        return response()->json($snags);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Snag::class);

        $organization = $this->currentOrganization($request);

        // DLP snags (Defects Liability Period) require a Cluster, a Taking-Over
        // Certificate reference, a discipline (trade) and a description of at
        // least 30 characters. The required photo is enforced client-side and
        // uploaded via the attachments endpoint immediately after creation.
        $isDlp = $request->boolean('is_dlp');
        // Operational snags are raised from an inspection rather than a plan, so a
        // drawing and pin are optional for them; construction snags still require them.
        $isOperational = $request->input('snag_type') === 'operational';

        $validated = $request->validate([
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'drawing_id' => [$isOperational ? 'nullable' : 'required', 'integer', 'exists:drawings,id'],
            'drawing_revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'location_text' => ['nullable', 'string', 'max:255'],
            'root_cause_category_id' => ['nullable', 'integer', 'exists:root_cause_categories,id'],
            'category_id' => ['nullable', 'integer', 'exists:snag_categories,id'],
            'source_organization_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'inspection_submission_id' => ['nullable', 'integer', 'exists:inspection_submissions,id'],
            'snag_type' => ['nullable', 'in:construction,operational'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipments,id'],
            'client_uuid' => ['nullable', 'uuid'],
            'title' => ['required', 'string', 'max:255'],
            'description' => $isDlp ? ['required', 'string', 'min:30'] : ['nullable', 'string'],
            'priority' => ['nullable', 'in:low,medium,high,critical'],
            'severity' => ['nullable', 'in:major,high,medium,low'],
            'trade' => ['nullable', 'string', 'max:120', Rule::requiredIf($isDlp)],
            'is_dlp' => ['nullable', 'boolean'],
            'cluster' => ['nullable', 'string', 'max:160', Rule::requiredIf($isDlp)],
            'toc_reference' => ['nullable', 'string', 'max:120', Rule::requiredIf($isDlp)],
            'taking_over_certificate_id' => ['nullable', 'integer', 'exists:taking_over_certificates,id'],
            'pin_x' => [$isOperational ? 'nullable' : 'required', 'numeric', 'min:0', 'max:1'],
            'pin_y' => [$isOperational ? 'nullable' : 'required', 'numeric', 'min:0', 'max:1'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'assigned_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'due_date' => ['nullable', 'date'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
        ]);

        $project = Project::query()->findOrFail($validated['project_id']);
        $this->assertOrganization($project->organization_id, $request);
        $this->assertScopedPermission($request, $project->id, 'snags.create', 'You do not have permission to create snags for this project.');

        $drawing = null;
        if (! empty($validated['drawing_id'])) {
            $drawing = Drawing::query()->findOrFail($validated['drawing_id']);
            $this->assertOrganization($drawing->organization_id, $request);

            if ($drawing->project_id !== $project->id) {
                abort(422, 'Drawing does not belong to the selected project.');
            }
        }

        if ($drawing && ! empty($validated['drawing_revision_id'])) {
            $revision = DrawingRevision::query()->findOrFail($validated['drawing_revision_id']);
            if ($revision->drawing_id !== $drawing->id || $revision->organization_id !== $organization->id) {
                abort(422, 'Invalid drawing revision for selected drawing.');
            }
        }

        if (! empty($validated['equipment_id'])) {
            $equipment = Equipment::query()->findOrFail($validated['equipment_id']);
            if ($equipment->organization_id !== $organization->id) {
                abort(422, 'Invalid equipment selection.');
            }
        }

        if (! empty($validated['root_cause_category_id'])) {
            $rootCause = RootCauseCategory::query()->findOrFail($validated['root_cause_category_id']);
            if ($rootCause->organization_id !== $organization->id || ! $rootCause->is_active) {
                abort(422, 'Invalid root cause category.');
            }
        }

        if (! empty($validated['category_id'])) {
            $category = SnagCategory::query()->findOrFail($validated['category_id']);
            if ($category->organization_id !== $organization->id || ! $category->is_active) {
                abort(422, 'Invalid snag category.');
            }
        }

        if (! empty($validated['source_organization_id'])) {
            $sourceOrg = StakeholderCompany::query()->findOrFail($validated['source_organization_id']);
            if ($sourceOrg->organization_id !== $organization->id) {
                abort(422, 'Invalid source organization.');
            }
        }

        if (! empty($validated['inspection_submission_id'])) {
            $submission = InspectionSubmission::query()->findOrFail($validated['inspection_submission_id']);
            if ($submission->organization_id !== $organization->id) {
                abort(422, 'Invalid inspection submission.');
            }
        }

        // Bind the snag to a Taking-Over Certificate. A DLP defect logged against
        // a certificate whose DLP window has expired (or is already closed) is
        // rejected — such defects fall outside the contractor's liability period.
        if (! empty($validated['taking_over_certificate_id'])) {
            $certificate = TakingOverCertificate::query()->findOrFail($validated['taking_over_certificate_id']);
            if ($certificate->organization_id !== $organization->id || $certificate->project_id !== $project->id) {
                abort(422, 'The taking-over certificate does not belong to this project.');
            }

            if ($isDlp && in_array($certificate->dlpStatus(), ['expired', 'completed'], true)) {
                abort(422, 'The Defects Liability Period for this certificate has ended; new DLP defects cannot be logged against it.');
            }

            // Keep the free-text reference consistent with the linked certificate.
            $validated['toc_reference'] = $certificate->reference;
        }

        $this->assertOrganizationIntegrity($request, Arr::only($validated, ['building_id', 'area_id', 'floor_id', 'location_id']));

        $assignedCompany = $this->resolveStakeholderCompany(
            Arr::exists($validated, 'assigned_company_id') ? (int) ($validated['assigned_company_id'] ?? 0) : null,
            $organization->id,
        );
        $assignedTeam = $this->resolveStakeholderTeam(
            Arr::exists($validated, 'assigned_team_id') ? (int) ($validated['assigned_team_id'] ?? 0) : null,
            $organization->id,
            $project->id,
        );
        $this->assertStakeholderRelationship($assignedCompany, $assignedTeam);

        $assignedTo = null;
        if (! empty($validated['assigned_to']) || $assignedCompany || $assignedTeam) {
            $this->assertScopedPermission($request, $project->id, 'snags.assign', 'You do not have permission to assign snags.');
        }

        if (! empty($validated['assigned_to'])) {
            $assignedTo = User::query()->findOrFail($validated['assigned_to']);
            if (! $assignedTo->organizations()->where('organizations.id', $organization->id)->exists()) {
                abort(422, 'Assignee is not a member of this organization.');
            }

            $this->assertAssigneeMatchesStakeholder($assignedTo, $assignedCompany, $assignedTeam);
        }

        $status = ($assignedTo || $assignedCompany || $assignedTeam)
            ? SnagStatus::Assigned->value
            : SnagStatus::New->value;

        // Derive the severity axis from priority when the client has not supplied it.
        $validated['severity'] = $validated['severity'] ?? $this->severityFromPriority($validated['priority'] ?? 'medium');

        $snag = Snag::create([
            ...Arr::except($validated, ['assigned_to', 'assigned_company_id', 'assigned_team_id']),
            'organization_id' => $organization->id,
            'reference' => $this->nextReference($organization->id),
            'priority' => $validated['priority'] ?? 'medium',
            'status' => $status,
            'created_by' => $request->user()->id,
            'assigned_to' => $assignedTo?->id,
            'assigned_company_id' => $assignedCompany?->id,
            'assigned_team_id' => $assignedTeam?->id,
            'acknowledged_at' => $status === SnagStatus::Assigned->value ? now() : null,
        ]);

        SnagStatusHistory::create([
            'snag_id' => $snag->id,
            'organization_id' => $organization->id,
            'from_status' => null,
            'to_status' => $snag->status,
            'changed_by' => $request->user()->id,
            'note' => 'Snag created.',
        ]);

        // An operational snag raised on an inspection that is linked to a handover
        // auto-attaches to that handover so it counts toward the closure gate; the
        // snag's source_organization_id is preserved (BR-FR-023, BR-BR-009/011).
        if ($snag->snag_type === 'operational' && $snag->inspection_submission_id) {
            $submission = InspectionSubmission::query()->find($snag->inspection_submission_id);
            if ($submission && $submission->handover_request_id) {
                HandoverRequest::query()->find($submission->handover_request_id)?->snags()->syncWithoutDetaching([
                    $snag->id => [
                        'organization_id' => $organization->id,
                        'is_mandatory' => true,
                        'attached_by' => $request->user()->id,
                    ],
                ]);
            }
        }

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $request->user()->id);
        $this->workflowAutomationService->applyForSnag($snag, $request->user(), 'snag_created');
        $snag->refresh();

        event(new SnagCreated($snag->load(['project', 'creator', 'assignee']), $request->user()));

        return response()->json([
            'data' => $snag->load([
                'assignee:id,name,email',
                'assignedCompany:id,name,code,type',
                'assignedTeam:id,name,code,project_id,company_id',
                'dispatchRecipient:id,name,email',
                'area:id,name,code',
                'rootCauseCategory:id,name,code',
                'category:id,name,code',
                'sourceOrganization:id,name,code,type',
                'creator:id,name,email',
            ]),
        ], 201);
    }

    public function show(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('view', $snag);

        $snag->load([
            'project:id,name,code',
            'drawing:id,title,code,current_revision_id',
            'drawingRevision:id,drawing_id,revision_label,file_name,mime_type,file_size,is_current',
            'building:id,name,code',
            'area:id,name,code',
            'floor:id,name,code,level',
            'location:id,name,code,barcode',
            'rootCauseCategory:id,name,code',
            'category:id,name,code',
            'sourceOrganization:id,name,code,type',
            'inspectionSubmission:id,reference,status',
            'equipment:id,name,code,status,barcode',
            'creator:id,name,email',
            'closer:id,name,email',
            'assignee:id,name,email',
            'assignedCompany:id,name,code,type',
            'assignedTeam:id,name,code,project_id,company_id',
            'dispatchRecipient:id,name,email',
            'attachments' => fn ($query) => $query->orderByDesc('created_at'),
            'comments' => fn ($query) => $query
                ->whereNull('parent_id')
                ->with([
                    'user:id,name,email',
                    'attachments',
                    'mentions.mentionedUser:id,name,email',
                    'mentions.mentionedTeam:id,name,code',
                    'replies' => fn ($replyQuery) => $replyQuery
                        ->with([
                            'user:id,name,email',
                            'attachments',
                            'mentions.mentionedUser:id,name,email',
                            'mentions.mentionedTeam:id,name,code',
                        ])
                        ->orderBy('created_at'),
                ])
                ->orderByDesc('created_at'),
            'watchers' => fn ($query) => $query
                ->with(['user:id,name,email', 'creator:id,name,email'])
                ->orderByDesc('created_at'),
            'watcherUsers:id,name,email',
            'escalations' => fn ($query) => $query
                ->with(['recipient:id,name,email', 'rule:id,name,overdue_days,cooldown_hours'])
                ->orderByDesc('escalated_at')
                ->limit(25),
            'statusHistory' => fn ($query) => $query->with('changedBy:id,name,email')->orderByDesc('created_at'),
            'closeoutInstance.template.items',
            'closeoutInstance.items.evidences',
        ]);

        $payload = $snag->toArray();
        $payload['workflow'] = $this->buildWorkflowMetadata($snag);

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function update(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('update', $snag);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['sometimes', 'required', 'in:low,medium,high,critical'],
            'severity' => ['sometimes', 'nullable', 'in:major,high,medium,low'],
            'trade' => ['nullable', 'string', 'max:120'],
            'is_dlp' => ['sometimes', 'boolean'],
            'cluster' => ['nullable', 'string', 'max:160'],
            'toc_reference' => ['nullable', 'string', 'max:120'],
            'drawing_revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'location_text' => ['nullable', 'string', 'max:255'],
            'root_cause_category_id' => ['nullable', 'integer', 'exists:root_cause_categories,id'],
            'category_id' => ['nullable', 'integer', 'exists:snag_categories,id'],
            'source_organization_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipments,id'],
            'pin_x' => ['sometimes', 'required', 'numeric', 'min:0', 'max:1'],
            'pin_y' => ['sometimes', 'required', 'numeric', 'min:0', 'max:1'],
            'assignment_reason' => ['nullable', 'string', 'max:2000'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'assigned_company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'assigned_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'due_date' => ['nullable', 'date'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
        ]);

        $this->assertOrganizationIntegrity($request, Arr::only($validated, ['building_id', 'area_id', 'floor_id', 'location_id']));

        if (array_key_exists('drawing_revision_id', $validated) && $validated['drawing_revision_id']) {
            $revision = DrawingRevision::query()->findOrFail($validated['drawing_revision_id']);
            if ($revision->drawing_id !== $snag->drawing_id || $revision->organization_id !== $snag->organization_id) {
                abort(422, 'Invalid drawing revision for this snag.');
            }
        }

        if (array_key_exists('equipment_id', $validated) && $validated['equipment_id']) {
            $equipment = Equipment::query()->findOrFail($validated['equipment_id']);
            if ($equipment->organization_id !== $snag->organization_id) {
                abort(422, 'Invalid equipment selection.');
            }
        }

        if (array_key_exists('root_cause_category_id', $validated) && $validated['root_cause_category_id']) {
            $rootCause = RootCauseCategory::query()->findOrFail($validated['root_cause_category_id']);
            if ($rootCause->organization_id !== $snag->organization_id || ! $rootCause->is_active) {
                abort(422, 'Invalid root cause category.');
            }
        }

        if (array_key_exists('category_id', $validated) && $validated['category_id']) {
            $category = SnagCategory::query()->findOrFail($validated['category_id']);
            if ($category->organization_id !== $snag->organization_id || ! $category->is_active) {
                abort(422, 'Invalid snag category.');
            }
        }

        if (array_key_exists('source_organization_id', $validated) && $validated['source_organization_id']) {
            $sourceOrg = StakeholderCompany::query()->findOrFail($validated['source_organization_id']);
            if ($sourceOrg->organization_id !== $snag->organization_id) {
                abort(422, 'Invalid source organization.');
            }
        }

        $assignmentKeys = ['assigned_to', 'assigned_company_id', 'assigned_team_id'];
        $updatingAssignment = count(array_intersect(array_keys($validated), $assignmentKeys)) > 0;

        if ($updatingAssignment) {
            $this->authorize('assign', $snag);
            $this->assertScopedPermission($request, $snag->project_id, 'snags.assign', 'You do not have permission to assign snags.');
        }

        $previousAssigneeId = $snag->assigned_to;
        $previousCompanyId = $snag->assigned_company_id;
        $previousTeamId = $snag->assigned_team_id;

        $finalAssigneeId = array_key_exists('assigned_to', $validated)
            ? (int) ($validated['assigned_to'] ?? 0)
            : (int) ($snag->assigned_to ?? 0);

        $finalCompanyId = array_key_exists('assigned_company_id', $validated)
            ? (int) ($validated['assigned_company_id'] ?? 0)
            : (int) ($snag->assigned_company_id ?? 0);

        $finalTeamId = array_key_exists('assigned_team_id', $validated)
            ? (int) ($validated['assigned_team_id'] ?? 0)
            : (int) ($snag->assigned_team_id ?? 0);

        $assignedCompany = $this->resolveStakeholderCompany($finalCompanyId > 0 ? $finalCompanyId : null, $snag->organization_id);
        $assignedTeam = $this->resolveStakeholderTeam($finalTeamId > 0 ? $finalTeamId : null, $snag->organization_id, $snag->project_id);
        $this->assertStakeholderRelationship($assignedCompany, $assignedTeam);

        $newAssignee = null;
        if ($finalAssigneeId > 0) {
            $newAssignee = User::query()->findOrFail($finalAssigneeId);
            if (! $newAssignee->organizations()->where('organizations.id', $snag->organization_id)->exists()) {
                abort(422, 'Assignee is not a member of this organization.');
            }

            $this->assertAssigneeMatchesStakeholder($newAssignee, $assignedCompany, $assignedTeam);
        }

        // BR-FR-016: a mandatory reason is required on a true re-assignment — i.e. the snag
        // already had an assignee/company/team and that assignment is now changing. First-time
        // assignment does not require a reason.
        if ($updatingAssignment) {
            $hadPriorAssignment = $previousAssigneeId !== null
                || $previousCompanyId !== null
                || $previousTeamId !== null;

            $assignmentChanged = (int) $previousAssigneeId !== (int) ($newAssignee?->id)
                || (int) $previousCompanyId !== (int) ($assignedCompany?->id)
                || (int) $previousTeamId !== (int) ($assignedTeam?->id);

            $reasonProvided = trim((string) ($validated['assignment_reason'] ?? '')) !== '';

            if ($hadPriorAssignment && $assignmentChanged && ! $reasonProvided) {
                throw ValidationException::withMessages([
                    'assignment_reason' => ['A reason is required when reassigning a snag that already has an assignee, company, or team.'],
                ]);
            }
        }

        $snag->fill(Arr::except($validated, ['assigned_to', 'assigned_company_id', 'assigned_team_id']));

        if ($updatingAssignment) {
            $snag->assigned_to = $newAssignee?->id;
            $snag->assigned_company_id = $assignedCompany?->id;
            $snag->assigned_team_id = $assignedTeam?->id;

            if (($snag->assigned_to || $snag->assigned_company_id || $snag->assigned_team_id) && $snag->status === SnagStatus::New->value) {
                $snag->status = SnagStatus::Assigned->value;
                $snag->acknowledged_at = $snag->acknowledged_at ?: now();
            }
        }

        $snag->save();

        // Audit any assignment change with an optional mandatory-capable reason
        // (BR-FR-016). Append-only history keeps the from/to trail intact.
        if ($updatingAssignment && (
            $previousAssigneeId !== $snag->assigned_to
            || $previousCompanyId !== $snag->assigned_company_id
            || $previousTeamId !== $snag->assigned_team_id
        )) {
            $reason = trim((string) ($validated['assignment_reason'] ?? ''));
            $from = [
                'assigned_to' => $previousAssigneeId,
                'assigned_company_id' => $previousCompanyId,
                'assigned_team_id' => $previousTeamId,
            ];
            $to = [
                'assigned_to' => $snag->assigned_to,
                'assigned_company_id' => $snag->assigned_company_id,
                'assigned_team_id' => $snag->assigned_team_id,
            ];

            SnagStatusHistory::create([
                'snag_id' => $snag->id,
                'organization_id' => $snag->organization_id,
                'from_status' => $snag->status,
                'to_status' => $snag->status,
                'changed_by' => $request->user()->id,
                'note' => $reason !== '' ? $reason : 'Assignment updated.',
                'metadata' => [
                    'event' => 'reassignment',
                    'reason' => $reason !== '' ? $reason : null,
                    'from' => $from,
                    'to' => $to,
                ],
            ]);

            // Item 9 (BR-BR-013): mirror the reassignment into the unified audit stream.
            $this->auditRecorder->record(
                $snag->organization_id,
                $request->user(),
                'snag.reassigned',
                $snag,
                $snag->project_id,
                $from,
                $to,
                $reason !== '' ? $reason : null,
            );
        }

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $request->user()->id);
        $this->workflowAutomationService->applyForSnag($snag, $request->user(), 'snag_updated');
        $snag->refresh();

        if ($snag->assigned_to && $snag->assigned_to !== $request->user()->id && $previousAssigneeId !== $snag->assigned_to) {
            $newAssignee = User::query()->find($snag->assigned_to);
            if ($newAssignee) {
                $newAssignee->notify(new SnagAssignedNotification($snag->load('project'), $request->user()));
            }
        }

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'updated',
            'snag_id' => $snag->id,
            'status' => $snag->status,
            'assigned_to' => $snag->assigned_to,
            'assigned_company_id' => $snag->assigned_company_id,
            'assigned_team_id' => $snag->assigned_team_id,
            'project_id' => $snag->project_id,
        ]));

        return response()->json([
            'data' => $snag->fresh([
                'assignee:id,name,email',
                'assignedCompany:id,name,code,type',
                'assignedTeam:id,name,code,project_id,company_id',
                'dispatchRecipient:id,name,email',
                'area:id,name,code',
                'rootCauseCategory:id,name,code',
                'category:id,name,code',
                'sourceOrganization:id,name,code,type',
                'creator:id,name,email',
            ]),
        ]);
    }

    public function dispatch(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('assign', $snag);
        $this->assertScopedPermission($request, $snag->project_id, 'snags.assign', 'You do not have permission to dispatch this snag.');

        if (! $snag->assigned_company_id && ! $snag->assigned_team_id) {
            throw ValidationException::withMessages([
                'assignment' => ['Set company or team assignment before dispatching this snag.'],
            ]);
        }

        $validated = $request->validate([
            'assigned_to' => ['required', 'integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:1500'],
        ]);

        $assignee = User::query()->findOrFail($validated['assigned_to']);

        if (! $assignee->organizations()->where('organizations.id', $snag->organization_id)->exists()) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Assignee is not a member of this organization.'],
            ]);
        }

        $company = $snag->assignedCompany;
        $team = $snag->assignedTeam;
        $this->assertAssigneeMatchesStakeholder($assignee, $company, $team);

        $fromStatus = $snag->status;

        $snag->assigned_to = $assignee->id;
        $snag->dispatched_to = $assignee->id;
        $snag->dispatch_note = $validated['note'] ?? null;
        $snag->dispatched_at = now();

        if ($snag->status === SnagStatus::New->value) {
            $snag->status = SnagStatus::Assigned->value;
            $snag->acknowledged_at = $snag->acknowledged_at ?: now();
        }

        $snag->save();

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $request->user()->id);

        SnagStatusHistory::query()->create([
            'snag_id' => $snag->id,
            'organization_id' => $snag->organization_id,
            'from_status' => $fromStatus,
            'to_status' => $snag->status,
            'changed_by' => $request->user()->id,
            'note' => $validated['note'] ?? 'Snag dispatched to individual assignee.',
            'metadata' => [
                'dispatch' => true,
                'dispatched_to' => $assignee->id,
            ],
        ]);

        if ($assignee->id !== $request->user()->id) {
            $assignee->notify(new SnagAssignedNotification($snag->load('project'), $request->user()));
        }

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'dispatched',
            'snag_id' => $snag->id,
            'status' => $snag->status,
            'assigned_to' => $snag->assigned_to,
            'assigned_company_id' => $snag->assigned_company_id,
            'assigned_team_id' => $snag->assigned_team_id,
            'project_id' => $snag->project_id,
        ]));

        return response()->json([
            'data' => $snag->fresh([
                'assignee:id,name,email',
                'assignedCompany:id,name,code,type',
                'assignedTeam:id,name,code,project_id,company_id',
                'dispatchRecipient:id,name,email',
                'area:id,name,code',
                'rootCauseCategory:id,name,code',
                'category:id,name,code',
                'sourceOrganization:id,name,code,type',
                'creator:id,name,email',
            ]),
        ]);
    }

    public function destroy(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('delete', $snag);

        $snag->delete();

        return response()->json([
            'message' => 'Snag deleted.',
        ]);
    }

    private function nextReference(int $organizationId): string
    {
        $next = Snag::query()
            ->where('organization_id', $organizationId)
            ->count() + 1;

        return 'SNG-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    /**
     * @param  array<string, mixed>  $ids
     */
    private function assertOrganizationIntegrity(Request $request, array $ids): void
    {
        $organization = $this->currentOrganization($request);

        if (! empty($ids['building_id'])) {
            $building = Building::query()->findOrFail($ids['building_id']);
            if ($building->organization_id !== $organization->id) {
                abort(422, 'Invalid building.');
            }
        }

        if (! empty($ids['area_id'])) {
            $area = Area::query()->findOrFail($ids['area_id']);
            if ($area->organization_id !== $organization->id) {
                abort(422, 'Invalid area.');
            }
        }

        if (! empty($ids['floor_id'])) {
            $floor = Floor::query()->findOrFail($ids['floor_id']);
            if ($floor->organization_id !== $organization->id) {
                abort(422, 'Invalid floor.');
            }
        }

        if (! empty($ids['location_id'])) {
            $location = Location::query()->findOrFail($ids['location_id']);
            if ($location->organization_id !== $organization->id) {
                abort(422, 'Invalid location.');
            }
        }
    }

    /**
     * Map the legacy priority axis onto the BRD severity axis (OD-07).
     */
    private function severityFromPriority(string $priority): string
    {
        return [
            'critical' => 'major',
            'high' => 'high',
            'medium' => 'medium',
            'low' => 'low',
        ][$priority] ?? 'medium';
    }

    private function assertScopedPermission(Request $request, int $projectId, string $permission, string $message): void
    {
        $organization = $this->currentOrganization($request);

        if (! $this->accessControlService->allows($request->user(), $organization->id, $projectId, $permission)) {
            $this->denyWithPermissions($request, [$permission], $message);
        }
    }

    private function resolveStakeholderCompany(?int $companyId, int $organizationId): ?StakeholderCompany
    {
        if (! $companyId) {
            return null;
        }

        $company = StakeholderCompany::query()->findOrFail($companyId);
        if ($company->organization_id !== $organizationId) {
            throw ValidationException::withMessages([
                'assigned_company_id' => ['Selected company does not belong to this organization.'],
            ]);
        }

        return $company;
    }

    private function resolveStakeholderTeam(?int $teamId, int $organizationId, int $projectId): ?StakeholderTeam
    {
        if (! $teamId) {
            return null;
        }

        $team = StakeholderTeam::query()->findOrFail($teamId);
        if ($team->organization_id !== $organizationId) {
            throw ValidationException::withMessages([
                'assigned_team_id' => ['Selected team does not belong to this organization.'],
            ]);
        }

        if ($team->project_id !== null && $team->project_id !== $projectId) {
            throw ValidationException::withMessages([
                'assigned_team_id' => ['Selected team is not available for this project.'],
            ]);
        }

        return $team;
    }

    private function assertStakeholderRelationship(?StakeholderCompany $company, ?StakeholderTeam $team): void
    {
        if (! $company || ! $team || ! $team->company_id) {
            return;
        }

        if ($team->company_id !== $company->id) {
            throw ValidationException::withMessages([
                'assigned_team_id' => ['Selected team does not belong to the selected company.'],
            ]);
        }
    }

    private function assertAssigneeMatchesStakeholder(?User $assignee, ?StakeholderCompany $company, ?StakeholderTeam $team): void
    {
        if (! $assignee) {
            return;
        }

        if ($team && ! $team->users()->where('users.id', $assignee->id)->wherePivot('is_active', true)->exists()) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Selected user is not an active member of the assigned team.'],
            ]);
        }

        if (! $team && $company && ! $company->users()->where('users.id', $assignee->id)->wherePivot('is_active', true)->exists()) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Selected user is not an active member of the assigned company.'],
            ]);
        }
    }

    /**
     * @return array{
     *   current_status:string,
     *   available_transitions:array<int, string>,
     *   next_actions:array<int, array{action_key:string,to_status:string,label:string,allowed:bool,reason:?string}>,
     *   recommended_next_status:?string,
     *   can_close:bool,
     *   closeout_completion:int,
     *   blocked:array<string, string>
     * }
     */
    private function buildWorkflowMetadata(Snag $snag): array
    {
        $transitions = SnagWorkflow::transitions()[$snag->status] ?? [];
        $closeoutCompletion = (int) ($snag->closeoutInstance?->completion_percentage ?? 0);
        $hasCloseTransition = in_array('closed', $transitions, true);
        // Use the read-only completeness check here: buildWorkflowMetadata is called
        // from the GET show() path, and canCloseSnag() would issue a COUNT query plus a
        // save()/fresh() write on every read. isCloseoutCompleteFromLoaded() derives the
        // same result from the already eager-loaded closeoutInstance.items.evidences.
        $closeBlocked = $hasCloseTransition && ! $this->closeoutService->isCloseoutCompleteFromLoaded($snag);
        $blocked = [];
        if ($closeBlocked) {
            $blocked['closed'] = 'Closeout must be 100% complete (including required evidence) before closing this snag.';
        }

        $labels = SnagStatus::labels();
        $nextActions = collect($transitions)
            ->map(function (string $status) use ($labels, $closeBlocked): array {
                $isBlocked = $status === SnagStatus::Closed->value && $closeBlocked;

                return [
                    'action_key' => 'transition.'.$status,
                    'to_status' => $status,
                    'label' => $labels[$status] ?? ucfirst(str_replace('_', ' ', $status)),
                    'allowed' => ! $isBlocked,
                    'reason' => $isBlocked
                        ? 'Closeout must be 100% complete (including required evidence) before closing this snag.'
                        : null,
                ];
            })
            ->values()
            ->all();

        $recommended = collect($transitions)
            ->first(fn (string $status): bool => ! ($status === 'closed' && $closeBlocked));

        return [
            'current_status' => $snag->status,
            'available_transitions' => $transitions,
            'next_actions' => $nextActions,
            'recommended_next_status' => $recommended ?: null,
            'can_close' => $snag->status === 'closed' || ($hasCloseTransition && ! $closeBlocked),
            'closeout_completion' => $closeoutCompletion,
            'blocked' => $blocked,
        ];
    }
}
