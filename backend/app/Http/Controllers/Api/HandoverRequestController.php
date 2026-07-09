<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\HandoverComment;
use App\Models\HandoverRequest;
use App\Models\HandoverRequestAttachment;
use App\Models\Project;
use App\Models\User;
use App\Services\AttachmentComplianceService;
use App\Services\HandoverRequestService;
use App\Services\HandoverRoutingService;
use App\Services\OpsHealthService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use App\Support\HandoverActions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class HandoverRequestController extends Controller
{
    use InteractsWithOrganizationContext;

    /** Actions routed through the generic act() endpoint (submit/assign/close are dedicated). */
    private const ACT_ACTIONS = [
        HandoverActions::COMMENT, HandoverActions::FORWARD, HandoverActions::APPROVE,
        HandoverActions::RETURN, HandoverActions::REJECT, HandoverActions::REVISE,
        HandoverActions::CONSOLIDATE,
    ];

    /** Allowed detected MIME types for handover supporting documents (BR-FR-020/021). */
    private const ATTACHMENT_MIMES = [
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    public function __construct(
        private readonly HandoverRequestService $requestService,
        private readonly HandoverRoutingService $routingService,
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', HandoverRequest::class);
        $organization = $this->currentOrganization($request);

        $query = HandoverRequest::query()
            ->where('organization_id', $organization->id)
            ->with([
                'project:id,name,code',
                'responsibleCompany:id,name,code,type',
                'assignee:id,name,email',
            ]);

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }
        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }
        if ($companyId = $request->integer('responsible_company_id')) {
            $query->where('responsible_company_id', $companyId);
        }

        return response()->json(
            $query->orderByDesc('updated_at')->paginate(min(100, max(5, $request->integer('per_page', 20))))
        );
    }

    public function show(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $handoverRequest->load([
            'project:id,name,code',
            'workflow:id,name,version',
            'responsibleCompany:id,name,code,type',
            'assignee:id,name,email',
            'submitter:id,name,email',
            'closer:id,name,email',
            'area:id,name,code',
            'building:id,name,code',
            'snags:id,reference,title,status,severity,snag_type,source_organization_id',
            'snags.sourceOrganization:id,name,code,type',
            'inspectionSubmissions:id,reference,status',
            'attachments' => fn ($query) => $query->with('uploader:id,name,email')->orderByDesc('created_at'),
            'events' => fn ($query) => $query->with('actor:id,name,email')->orderBy('created_at'),
        ]);

        $payload = $handoverRequest->toArray();
        $payload['summary'] = $this->routingService->summary($handoverRequest, $request->user());

        return response()->json(['data' => $payload]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', HandoverRequest::class);
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'location_text' => ['nullable', 'string', 'max:255'],
        ]);

        $project = Project::query()->findOrFail($validated['project_id']);
        $this->assertOrganization($project->organization_id, $request);

        $handoverRequest = $this->requestService->create(
            $request->user(),
            $organization->id,
            $project->id,
            $validated,
        );

        return response()->json(['data' => $handoverRequest], 201);
    }

    public function submit(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        return response()->json([
            'data' => $this->routingService->submit($handoverRequest, $request->user()),
        ]);
    }

    public function act(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $validated = $request->validate([
            'action' => ['required', 'string', Rule::in(self::ACT_ACTIONS)],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->routingService->act(
                $handoverRequest,
                $request->user(),
                $validated['action'],
                ['reason' => $validated['reason'] ?? null],
            ),
        ]);
    }

    public function assign(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $validated = $request->validate([
            'assignee_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $assignee = User::query()->findOrFail($validated['assignee_id']);

        return response()->json([
            'data' => $this->routingService->assign($handoverRequest, $request->user(), $assignee),
        ]);
    }

    public function close(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:2000'],
            'is_exception' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'data' => $this->routingService->close($handoverRequest, $request->user(), $validated),
        ]);
    }

    public function cancel(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->routingService->cancel($handoverRequest, $request->user(), $validated),
        ]);
    }

    public function summary(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        return response()->json([
            'data' => $this->routingService->summary($handoverRequest, $request->user()),
        ]);
    }

    public function attachSnags(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);
        $this->assertHandoverWriteAccess($request, $handoverRequest);

        $validated = $request->validate([
            'snag_ids' => ['required', 'array', 'min:1', 'max:500'],
            'snag_ids.*' => ['integer', 'distinct', 'exists:snags,id'],
            'is_mandatory' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'data' => $this->requestService->attachSnags(
                $request->user(),
                $handoverRequest,
                $validated['snag_ids'],
                (bool) ($validated['is_mandatory'] ?? true),
            ),
        ]);
    }

    public function attachInspections(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);
        $this->assertHandoverWriteAccess($request, $handoverRequest);

        $validated = $request->validate([
            'inspection_submission_ids' => ['required', 'array', 'min:1', 'max:200'],
            'inspection_submission_ids.*' => ['integer', 'distinct', 'exists:inspection_submissions,id'],
        ]);

        return response()->json([
            'data' => $this->requestService->attachInspections(
                $request->user(),
                $handoverRequest,
                $validated['inspection_submission_ids'],
            ),
        ]);
    }

    public function requestInspection(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $validated = $request->validate([
            'stakeholder_team_id' => ['required', 'integer', 'exists:stakeholder_teams,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'request_type' => ['nullable', 'string', 'max:60'],
            'scheduled_for' => ['nullable', 'date'],
        ]);

        return response()->json([
            'data' => $this->requestService->requestInspection($request->user(), $handoverRequest, $validated),
        ], 201);
    }

    /**
     * List the versioned supporting documents on a handover request, with the
     * uploader and timestamp for each (BR-FR-020/021, §11.2).
     */
    public function attachments(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $attachments = $handoverRequest->attachments()
            ->with('uploader:id,name,email')
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $attachments]);
    }

    /**
     * Upload a supporting document, stamping the uploader and the current cycle
     * pointer so evidence stays attributable across return/resubmit rounds
     * (BR-FR-021 Must). Reuses the platform's secure-upload gate.
     */
    public function storeAttachment(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);
        $this->assertHandoverWriteAccess($request, $handoverRequest);
        $organization = $this->currentOrganization($request);

        $request->validate([
            'file' => ['required', 'file', 'max:51200', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi,doc,docx,xls,xlsx'],
        ]);

        $file = $request->file('file');

        try {
            $safe = $this->uploadSecurityService->assertSafeUploadedFile($file, self::ATTACHMENT_MIMES, 52428800);
            $this->attachmentComplianceService->evaluate(
                $organization,
                (string) $file->getRealPath(),
                $safe['mime_type'],
                null,
                'handover_attachment',
                ['handover_request_id' => $handoverRequest->id, 'file_name' => $file->getClientOriginalName()],
            );
            $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);

            $path = $file->store(
                sprintf('handovers/org_%d/request_%d', $handoverRequest->organization_id, $handoverRequest->id),
                'public'
            );
        } catch (\Throwable $exception) {
            $this->opsHealthService->recordStorageFailure(
                $handoverRequest->organization_id,
                'handover_attachment',
                $exception->getMessage(),
                ['handover_request_id' => $handoverRequest->id, 'file_name' => $file->getClientOriginalName()],
            );
            throw $exception;
        }

        $attachment = $handoverRequest->attachments()->create([
            'organization_id' => $handoverRequest->organization_id,
            'cycle_number' => $handoverRequest->cycle_number,
            'uploaded_by' => $request->user()->id,
            'disk' => 'public',
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $safe['mime_type'],
            'size_bytes' => (int) $safe['file_size'],
        ]);

        return response()->json([
            'data' => $attachment->load('uploader:id,name,email'),
        ], 201);
    }

    /**
     * Stream a handover supporting document back to an authorised viewer.
     */
    public function downloadAttachment(Request $request, HandoverRequest $handoverRequest, HandoverRequestAttachment $attachment)
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        if ((int) $attachment->handover_request_id !== (int) $handoverRequest->id) {
            abort(404, 'Attachment does not belong to this handover request.');
        }

        $disk = $attachment->disk ?: 'public';
        if (! $attachment->path || ! Storage::disk($disk)->exists($attachment->path)) {
            abort(404, 'No file is attached to this record.');
        }

        return Storage::disk($disk)->download(
            $attachment->path,
            $attachment->original_name,
            ['Content-Type' => $attachment->mime_type ?? 'application/octet-stream']
        );
    }

    /**
     * The per-stage / per-org discussion thread (item 10 / BR-FR-031). Distinct
     * from the immutable audit timeline. Internal comments are visible only to the
     * author's own party; everything else is cross-party.
     */
    public function comments(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $viewerCompanyId = $this->resolveActorCompanyId($request->user(), $handoverRequest->organization_id);

        $comments = $handoverRequest->comments()
            ->with(['user:id,name,email', 'sourceCompany:id,name,code,type'])
            ->where(function ($query) use ($viewerCompanyId): void {
                $query->where('is_internal', false);
                if ($viewerCompanyId) {
                    $query->orWhere('source_company_id', $viewerCompanyId);
                }
            })
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $comments]);
    }

    public function storeComment(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        // Any participating party (not the read-only auditor) may join the thread —
        // gated on the RBAC verb only, NOT the current-stage party gate.
        if (! $request->user()->can('handover.comment')) {
            abort(403, 'You do not have permission to comment on handover requests.');
        }

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'is_internal' => ['sometimes', 'boolean'],
            'parent_id' => ['nullable', 'integer', 'exists:handover_comments,id'],
            'client_uuid' => ['nullable', 'uuid'],
        ]);

        // Idempotent offline replay.
        if (! empty($validated['client_uuid'])) {
            $existing = $handoverRequest->comments()->where('client_uuid', $validated['client_uuid'])->first();
            if ($existing) {
                return response()->json([
                    'data' => $existing->load(['user:id,name,email', 'sourceCompany:id,name,code,type']),
                ]);
            }
        }

        if (! empty($validated['parent_id'])) {
            $parent = HandoverComment::query()->findOrFail($validated['parent_id']);
            if ((int) $parent->handover_request_id !== (int) $handoverRequest->id) {
                abort(422, 'Parent comment does not belong to this handover request.');
            }
        }

        $sourceCompanyId = $this->resolveActorCompanyId($request->user(), $handoverRequest->organization_id);

        $comment = $handoverRequest->comments()->create([
            'organization_id' => $handoverRequest->organization_id,
            'user_id' => $request->user()->id,
            'source_company_id' => $sourceCompanyId,
            'parent_id' => $validated['parent_id'] ?? null,
            'stage_order' => $handoverRequest->current_stage_order,
            'cycle_number' => $handoverRequest->cycle_number,
            'client_uuid' => $validated['client_uuid'] ?? null,
            'body' => $validated['body'],
            'is_internal' => (bool) ($validated['is_internal'] ?? false),
        ]);

        // Notify the audience that can see it: the author's party for an internal
        // comment, otherwise the party currently responsible for the request.
        $audienceCompanyId = $comment->is_internal
            ? $sourceCompanyId
            : ($handoverRequest->responsible_company_id ? (int) $handoverRequest->responsible_company_id : null);

        if ($audienceCompanyId) {
            $this->routingService->notifyCommentPosted(
                $handoverRequest,
                $audienceCompanyId,
                $request->user(),
                Str::limit($comment->body, 140),
            );
        }

        return response()->json([
            'data' => $comment->load(['user:id,name,email', 'sourceCompany:id,name,code,type']),
        ], 201);
    }

    /**
     * The actor's active party (stakeholder company) in this organization, if any.
     */
    private function resolveActorCompanyId(User $user, int $organizationId): ?int
    {
        $companyId = DB::table('company_user')
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->value('company_id');

        return $companyId ? (int) $companyId : null;
    }

    /**
     * Gate the record-modifying handover endpoints (attach snags / inspections /
     * documents). Unlike the read-only 'view' policy, these mutate the record and
     * its close-gate inputs, so they require a transactional handover verb (which
     * the read-only auditor lacks) AND membership of a party on this handover — the
     * responsible or the originating party. Coordinators holding handover.assign
     * (e.g. FMMP) may also compile. No org-admin-only bypass.
     */
    private function assertHandoverWriteAccess(Request $request, HandoverRequest $handoverRequest): void
    {
        $user = $request->user();

        if (! $user->can('handover.comment') && ! $user->can('handover.assign')) {
            abort(403, 'You do not have permission to modify this handover request.');
        }

        if ($user->can('handover.assign')) {
            return; // coordinating role (FMMP) may compile snags/inspections/documents.
        }

        $partyCompanyIds = array_values(array_filter([
            $handoverRequest->responsible_company_id,
            $handoverRequest->submitted_by_company_id,
        ]));

        if ($partyCompanyIds === [] || ! $this->actorBelongsToParty($user, $handoverRequest->organization_id, $partyCompanyIds)) {
            abort(403, 'Only a participating party may modify this handover request.');
        }
    }

    /**
     * @param  array<int, int>  $companyIds
     */
    private function actorBelongsToParty(User $user, int $organizationId, array $companyIds): bool
    {
        if ($companyIds === []) {
            return false;
        }

        return DB::table('company_user')
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->where('is_active', true)
            ->whereIn('company_id', $companyIds)
            ->exists();
    }

    public function events(Request $request, HandoverRequest $handoverRequest): JsonResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $events = $handoverRequest->events()
            ->with(['actor:id,name,email', 'actorCompany:id,name,code,type'])
            ->orderBy('created_at')
            ->paginate(min(200, max(10, $request->integer('per_page', 100))));

        return response()->json($events);
    }

    /**
     * Stream the full audit trail of a handover request as CSV for governance and
     * handover evidence (BR-FR-009/010, §11.3). Read-only; covers every cycle.
     */
    public function auditExport(Request $request, HandoverRequest $handoverRequest): StreamedResponse
    {
        $this->assertOrganization($handoverRequest->organization_id, $request);
        $this->authorize('view', $handoverRequest);

        $events = $handoverRequest->events()
            ->with(['actor:id,name', 'actorCompany:id,name,type'])
            ->orderBy('created_at')
            ->get();

        $filename = 'handover-'.str_replace(['/', ' '], '-', $handoverRequest->reference).'-audit.csv';

        return response()->streamDownload(function () use ($handoverRequest, $events): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Reference', 'Cycle', 'Timestamp (UTC)', 'Action', 'Actor', 'Party', 'Role', 'From stage', 'To stage', 'From status', 'To status', 'Reason']);

            foreach ($events as $event) {
                fputcsv($out, [
                    $handoverRequest->reference,
                    $event->cycle_number,
                    optional($event->created_at)->toIso8601String(),
                    $event->action,
                    $event->actor?->name ?? '',
                    $event->actorCompany?->name ?? '',
                    $event->actor_role ?? '',
                    $event->prior_stage_order ?? '',
                    $event->new_stage_order ?? '',
                    $event->prior_status ?? '',
                    $event->new_status ?? '',
                    $event->reason ?? '',
                ]);
            }

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv',
            'Cache-Control' => 'no-store',
        ]);
    }
}
