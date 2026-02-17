<?php

namespace App\Http\Controllers\Api;

use App\Events\InspectionRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Project;
use App\Services\InspectionApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InspectionSubmissionController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly InspectionApprovalService $approvalService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', InspectionSubmission::class);

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = InspectionSubmission::query()
            ->where('organization_id', $organization->id)
            ->with([
                'template:id,name,type,project_id',
                'project:id,name,code',
                'creator:id,name,email',
                'submitter:id,name,email',
            ]);

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($templateId = $request->integer('inspection_template_id')) {
            $query->where('inspection_template_id', $templateId);
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($type = $request->string('type')->toString()) {
            $query->whereHas('template', fn ($builder) => $builder->where('type', $type));
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('reference', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhereHas('template', fn ($inner) => $inner->where('name', 'like', "%{$search}%"));
            });
        }

        $submissions = $query
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json($submissions);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', InspectionSubmission::class);

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'inspection_template_id' => ['required', 'integer', 'exists:inspection_templates,id'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'form_data' => ['nullable', 'array'],
        ]);

        $template = InspectionTemplate::query()->findOrFail($validated['inspection_template_id']);
        $this->assertOrganization($template->organization_id, $request);

        if ($template->project_id && array_key_exists('project_id', $validated) && $validated['project_id'] && $template->project_id !== (int) $validated['project_id']) {
            abort(422, 'Template is bound to a different project.');
        }

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $submission = InspectionSubmission::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $validated['project_id'] ?? $template->project_id,
            'inspection_template_id' => $template->id,
            'reference' => $this->nextReference($organization->id),
            'status' => InspectionSubmission::STATUS_DRAFT,
            'form_data' => $validated['form_data'] ?? [],
            'created_by' => $request->user()->id,
            'last_updated_by' => $request->user()->id,
        ]);

        event(new InspectionRealtimeMessage($organization->id, [
            'action' => 'submission_created',
            'inspection_submission_id' => $submission->id,
            'reference' => $submission->reference,
            'status' => $submission->status,
            'project_id' => $submission->project_id,
        ]));

        return response()->json([
            'data' => $submission->fresh([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
        ]),
        ], 201);
    }

    public function show(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('view', $inspectionSubmission);

        $inspectionSubmission->load([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
            'requests' => fn ($query) => $query
                ->with(['requester:id,name,email', 'assignee:id,name,email'])
                ->orderByDesc('created_at'),
        ]);

        return response()->json([
            'data' => $inspectionSubmission,
        ]);
    }

    public function update(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('update', $inspectionSubmission);

        if (! in_array($inspectionSubmission->status, [InspectionSubmission::STATUS_DRAFT, InspectionSubmission::STATUS_IN_REVIEW], true)) {
            abort(422, 'Submission cannot be edited in current status.');
        }

        $validated = $request->validate([
            'form_data' => ['nullable', 'array'],
        ]);

        $inspectionSubmission->form_data = $validated['form_data'] ?? $inspectionSubmission->form_data;
        $inspectionSubmission->last_updated_by = $request->user()->id;
        $inspectionSubmission->save();

        event(new InspectionRealtimeMessage($inspectionSubmission->organization_id, [
            'action' => 'submission_updated',
            'inspection_submission_id' => $inspectionSubmission->id,
            'reference' => $inspectionSubmission->reference,
            'status' => $inspectionSubmission->status,
            'project_id' => $inspectionSubmission->project_id,
        ]));

        return response()->json([
            'data' => $inspectionSubmission->fresh([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
        ]),
        ]);
    }

    public function submit(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('submit', $inspectionSubmission);

        $updated = $this->approvalService->submit($inspectionSubmission, $request->user());

        return response()->json([
            'data' => $updated,
        ]);
    }

    private function nextReference(int $organizationId): string
    {
        $next = InspectionSubmission::query()
            ->where('organization_id', $organizationId)
            ->count() + 1;

        return 'INSP-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}
