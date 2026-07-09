<?php

namespace App\Http\Controllers\Api;

use App\Events\InspectionRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionContribution;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Project;
use App\Models\User;
use App\Services\InspectionApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
                // `schema` is required to compute the completion_percent accessor;
                // loading it here keeps the percent computation eager (no N+1).
                'template:id,name,type,project_id,schema',
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

        // Expose the computed completion_percent on every row (template schema is
        // already eager-loaded above, so this stays free of per-row queries).
        $submissions->getCollection()->each->append('completion_percent');

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

        // Attribute the initial observations to their author + party (BR-BR-002/017).
        $this->recordContributions($submission, $request->user(), [], $validated['form_data'] ?? []);

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
            'contributions' => fn ($query) => $query
                ->with(['user:id,name,email', 'company:id,name,code,type'])
                ->orderBy('created_at'),
        ]);

        // Template (with schema) is loaded above, so the completion_percent accessor
        // computes without extra queries.
        $inspectionSubmission->append('completion_percent');

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

        // Submit-lock (BR-BR-002): once a submission has been submitted and is under
        // review, the inspecting team may no longer edit it — only a reviewer/FMMP may.
        if ($inspectionSubmission->status === InspectionSubmission::STATUS_IN_REVIEW
            && ! $request->user()->can('inspections.approvals.review')) {
            abort(403, 'A submitted inspection under review can only be edited by a reviewer.');
        }

        $validated = $request->validate([
            'form_data' => ['nullable', 'array'],
        ]);

        // Merge (append) rather than overwrite, so multiple contributors accumulate
        // their observations on the same submission (BR-BR-002/017).
        $prior = is_array($inspectionSubmission->form_data) ? $inspectionSubmission->form_data : [];
        $incoming = $validated['form_data'] ?? [];
        $inspectionSubmission->form_data = array_merge($prior, $incoming);
        $inspectionSubmission->last_updated_by = $request->user()->id;
        $inspectionSubmission->save();

        $this->recordContributions($inspectionSubmission, $request->user(), $prior, $incoming);

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

    /**
     * Record an attributed contribution for each observation field the actor
     * added or changed in this update (BR-BR-002/017).
     *
     * @param  array<string, mixed>  $priorForm
     * @param  array<string, mixed>  $newForm
     */
    private function recordContributions(InspectionSubmission $submission, User $user, array $priorForm, array $newForm): void
    {
        if ($newForm === []) {
            return;
        }

        $companyId = $this->resolveActorCompanyId($user, $submission->organization_id);

        foreach ($newForm as $key => $value) {
            if (array_key_exists($key, $priorForm) && $priorForm[$key] === $value) {
                continue; // unchanged — not a new contribution
            }

            InspectionContribution::query()->create([
                'organization_id' => $submission->organization_id,
                'inspection_submission_id' => $submission->id,
                'user_id' => $user->id,
                'stakeholder_company_id' => $companyId,
                'field_key' => (string) $key,
                'contribution_type' => 'observation',
            ]);
        }
    }

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
}
