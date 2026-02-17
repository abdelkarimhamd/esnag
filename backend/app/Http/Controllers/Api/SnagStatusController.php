<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Snag;
use App\Services\SnagTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SnagStatusController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly SnagTransitionService $transitionService,
    ) {
    }

    public function transition(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('transition', $snag);

        $validated = $request->validate([
            'to_status' => ['required', 'string', 'in:new,assigned,in_progress,ready_for_review,closed,rejected'],
            'note' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer'],
        ]);

        try {
            $updated = $this->transitionService->transition(
                $snag,
                $request->user(),
                $validated['to_status'],
                $validated['note'] ?? null,
                array_key_exists('assigned_to', $validated) ? (int) ($validated['assigned_to'] ?? 0) : null,
            );
        } catch (ValidationException $exception) {
            return response()->json([
                'message' => 'Status transition blocked.',
                'errors' => $exception->errors(),
            ], 422);
        }

        return response()->json([
            'data' => $updated,
        ]);
    }
}
