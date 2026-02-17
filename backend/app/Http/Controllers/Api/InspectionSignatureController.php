<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionApproval;
use App\Models\InspectionSignature;
use App\Models\InspectionSubmission;
use App\Services\InspectionApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class InspectionSignatureController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly InspectionApprovalService $approvalService,
    ) {
    }

    public function store(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('sign', $inspectionSubmission);

        $validated = $request->validate([
            'signature_data' => ['required', 'string'],
            'approval_id' => ['nullable', 'integer', 'exists:inspection_approvals,id'],
            'context' => ['nullable', 'string', 'max:120'],
        ]);

        $approval = null;
        if (! empty($validated['approval_id'])) {
            $approval = InspectionApproval::query()->findOrFail($validated['approval_id']);
            if ($approval->inspection_submission_id !== $inspectionSubmission->id) {
                abort(422, 'Approval does not belong to this submission.');
            }
        }

        $updated = $this->approvalService->captureSignature(
            $inspectionSubmission,
            $request->user(),
            $validated['signature_data'],
            $approval,
            $validated['context'] ?? null,
        );

        return response()->json([
            'data' => $updated,
        ], 201);
    }

    public function download(Request $request, InspectionSignature $inspectionSignature)
    {
        $this->assertOrganization($inspectionSignature->organization_id, $request);

        $submission = InspectionSubmission::query()->findOrFail($inspectionSignature->inspection_submission_id);
        $this->authorize('view', $submission);

        return Storage::disk('public')->download(
            $inspectionSignature->file_path,
            $inspectionSignature->file_name,
            ['Content-Type' => $inspectionSignature->mime_type]
        );
    }
}

