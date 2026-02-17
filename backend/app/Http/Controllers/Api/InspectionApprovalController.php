<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionSubmission;
use App\Services\InspectionApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InspectionApprovalController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly InspectionApprovalService $approvalService,
    ) {
    }

    public function decide(Request $request, InspectionSubmission $inspectionSubmission): JsonResponse
    {
        $this->assertOrganization($inspectionSubmission->organization_id, $request);
        $this->authorize('approve', $inspectionSubmission);

        $validated = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
            'notes' => ['nullable', 'string'],
        ]);

        $updated = $this->approvalService->review(
            $inspectionSubmission,
            $request->user(),
            $validated['decision'],
            $validated['notes'] ?? null,
        );

        return response()->json([
            'data' => $updated,
        ]);
    }
}

