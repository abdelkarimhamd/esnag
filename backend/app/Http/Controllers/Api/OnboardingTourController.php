<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\OnboardingTourProgress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class OnboardingTourController extends Controller
{
    use InteractsWithOrganizationContext;

    public function show(Request $request, string $tourKey): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        $progress = OnboardingTourProgress::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $request->user()->id)
            ->where('tour_key', $tourKey)
            ->first();

        return response()->json([
            'data' => $progress ?? [
                'tour_key' => $tourKey,
                'current_step' => 0,
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => null,
            ],
        ]);
    }

    public function update(Request $request, string $tourKey): JsonResponse
    {
        if (! $request->user()->can('onboarding.update')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'current_step' => ['nullable', 'integer', 'min:0'],
            'completed' => ['nullable', 'boolean'],
            'skipped' => ['nullable', 'boolean'],
            'meta' => ['nullable', 'array'],
        ]);

        $progress = OnboardingTourProgress::query()->firstOrNew([
            'organization_id' => $organization->id,
            'user_id' => $request->user()->id,
            'tour_key' => $tourKey,
        ]);

        if (array_key_exists('current_step', $validated)) {
            $progress->current_step = $validated['current_step'];
        }

        $progress->last_viewed_at = Carbon::now();

        if (($validated['completed'] ?? false) === true) {
            $progress->completed_at = Carbon::now();
        }

        if (($validated['skipped'] ?? false) === true) {
            $progress->skipped_at = Carbon::now();
        }

        if (array_key_exists('meta', $validated)) {
            $progress->meta = $validated['meta'];
        }

        $progress->save();

        return response()->json([
            'data' => $progress,
        ]);
    }
}

