<?php

namespace App\Http\Controllers\Api;

use App\Events\InspectionRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class InspectionRequestController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', InspectionRequest::class);

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = InspectionRequest::query()
            ->where('organization_id', $organization->id)
            ->with([
                'project:id,name,code',
                'submission:id,reference,status',
                'requester:id,name,email',
                'assignee:id,name,email',
            ]);

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($type = $request->string('request_type')->toString()) {
            $query->where('request_type', $type);
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('reference', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%");
            });
        }

        $requests = $query
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json($requests);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', InspectionRequest::class);

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'inspection_submission_id' => ['nullable', 'integer', 'exists:inspection_submissions,id'],
            'request_type' => ['required', 'in:mir,wir,ir'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'scheduled_for' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        if (! empty($validated['inspection_submission_id'])) {
            $submission = InspectionSubmission::query()->findOrFail($validated['inspection_submission_id']);
            $this->assertOrganization($submission->organization_id, $request);
        }

        if (! empty($validated['assigned_to'])) {
            $assignee = User::query()->findOrFail($validated['assigned_to']);
            if (! $assignee->organizations()->where('organizations.id', $organization->id)->exists()) {
                abort(422, 'Assignee is not a member of this organization.');
            }
        }

        $requestModel = InspectionRequest::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $validated['project_id'] ?? null,
            'inspection_submission_id' => $validated['inspection_submission_id'] ?? null,
            'reference' => $this->nextReference($organization->id),
            'request_type' => $validated['request_type'],
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => ! empty($validated['scheduled_for'])
                ? InspectionRequest::STATUS_SCHEDULED
                : InspectionRequest::STATUS_REQUESTED,
            'requested_by' => $request->user()->id,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'scheduled_for' => ! empty($validated['scheduled_for']) ? Carbon::parse($validated['scheduled_for']) : null,
            'metadata' => $validated['metadata'] ?? null,
        ]);

        event(new InspectionRealtimeMessage($organization->id, [
            'action' => 'request_created',
            'inspection_request_id' => $requestModel->id,
            'reference' => $requestModel->reference,
            'status' => $requestModel->status,
            'project_id' => $requestModel->project_id,
        ]));

        return response()->json([
            'data' => $requestModel->fresh([
                'project:id,name,code',
                'submission:id,reference,status',
                'requester:id,name,email',
                'assignee:id,name,email',
            ]),
        ], 201);
    }

    public function show(Request $request, InspectionRequest $inspectionRequest): JsonResponse
    {
        $this->assertOrganization($inspectionRequest->organization_id, $request);
        $this->authorize('view', $inspectionRequest);

        $inspectionRequest->load([
            'project:id,name,code',
            'submission:id,reference,status',
            'requester:id,name,email',
            'assignee:id,name,email',
        ]);

        return response()->json([
            'data' => $inspectionRequest,
        ]);
    }

    public function update(Request $request, InspectionRequest $inspectionRequest): JsonResponse
    {
        $this->assertOrganization($inspectionRequest->organization_id, $request);
        $this->authorize('update', $inspectionRequest);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'scheduled_for' => ['nullable', 'date'],
            'status' => ['sometimes', 'required', 'in:requested,scheduled,in_progress,completed,rejected,cancelled'],
            'metadata' => ['nullable', 'array'],
        ]);

        if (array_key_exists('assigned_to', $validated) && $validated['assigned_to']) {
            $assignee = User::query()->findOrFail($validated['assigned_to']);
            if (! $assignee->organizations()->where('organizations.id', $inspectionRequest->organization_id)->exists()) {
                abort(422, 'Assignee is not a member of this organization.');
            }
        }

        $inspectionRequest->fill([
            'title' => $validated['title'] ?? $inspectionRequest->title,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $inspectionRequest->description,
            'assigned_to' => array_key_exists('assigned_to', $validated) ? $validated['assigned_to'] : $inspectionRequest->assigned_to,
            'scheduled_for' => array_key_exists('scheduled_for', $validated) && $validated['scheduled_for']
                ? Carbon::parse($validated['scheduled_for'])
                : (array_key_exists('scheduled_for', $validated) ? null : $inspectionRequest->scheduled_for),
            'status' => $validated['status'] ?? $inspectionRequest->status,
            'metadata' => array_key_exists('metadata', $validated) ? $validated['metadata'] : $inspectionRequest->metadata,
        ]);

        if ($inspectionRequest->status === InspectionRequest::STATUS_COMPLETED) {
            $inspectionRequest->completed_at = Carbon::now();
        } elseif (array_key_exists('status', $validated)) {
            $inspectionRequest->completed_at = null;
        }

        $inspectionRequest->save();

        event(new InspectionRealtimeMessage($inspectionRequest->organization_id, [
            'action' => 'request_updated',
            'inspection_request_id' => $inspectionRequest->id,
            'reference' => $inspectionRequest->reference,
            'status' => $inspectionRequest->status,
            'project_id' => $inspectionRequest->project_id,
        ]));

        return response()->json([
            'data' => $inspectionRequest->fresh([
                'project:id,name,code',
                'submission:id,reference,status',
                'requester:id,name,email',
                'assignee:id,name,email',
            ]),
        ]);
    }

    private function nextReference(int $organizationId): string
    {
        $next = InspectionRequest::query()
            ->where('organization_id', $organizationId)
            ->count() + 1;

        return 'REQ-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}

