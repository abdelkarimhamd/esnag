<?php

namespace App\Http\Controllers\Api;

use App\Events\InspectionRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionApproval;
use App\Models\InspectionApprovalMessage;
use App\Models\InspectionSubmission;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InspectionApprovalMessageController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function store(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('view', $inspectionSubmission);

        if (! $this->canPostMessage($request, $inspectionSubmission)) {
            abort(403, 'You do not have permission to post approval messages.');
        }

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'message_type' => ['nullable', 'string', 'in:comment,note'],
            'approval_id' => ['nullable', 'integer', 'exists:inspection_approvals,id'],
            'payload' => ['nullable', 'array'],
        ]);

        $approval = null;
        if (! empty($validated['approval_id'])) {
            $approval = InspectionApproval::query()->findOrFail((int) $validated['approval_id']);
            if ($approval->inspection_submission_id !== $inspectionSubmission->id) {
                abort(422, 'Approval step does not belong to this submission.');
            }
        }

        $message = InspectionApprovalMessage::query()->create([
            'organization_id' => $inspectionSubmission->organization_id,
            'inspection_submission_id' => $inspectionSubmission->id,
            'inspection_approval_id' => $approval?->id,
            'user_id' => $request->user()->id,
            'message_type' => $validated['message_type'] ?? 'comment',
            'body' => $validated['body'],
            'payload' => $validated['payload'] ?? null,
        ]);

        event(new InspectionRealtimeMessage($inspectionSubmission->organization_id, [
            'action' => 'approval_message_added',
            'inspection_submission_id' => $inspectionSubmission->id,
            'message_id' => $message->id,
            'project_id' => $inspectionSubmission->project_id,
        ]));

        return response()->json([
            'data' => $message->load([
                'user:id,name,email',
                'approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            ]),
        ], 201);
    }

    private function canPostMessage(Request $request, InspectionSubmission $inspectionSubmission): bool
    {
        $user = $request->user();
        $organizationId = $inspectionSubmission->organization_id;
        $projectId = $inspectionSubmission->project_id;

        if ($user->id === $inspectionSubmission->created_by || $user->id === $inspectionSubmission->submitted_by) {
            return true;
        }

        return $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.approvals.review')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.submissions.update')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.submissions.submit');
    }
}

