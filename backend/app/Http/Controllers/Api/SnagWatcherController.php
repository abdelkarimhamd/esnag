<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Snag;
use App\Models\User;
use App\Services\SnagCollaborationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SnagWatcherController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly SnagCollaborationService $snagCollaborationService,
    ) {
    }

    public function index(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('view', $snag);

        $watchers = $snag->watchers()
            ->with(['user:id,name,email', 'creator:id,name,email'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $watchers,
        ]);
    }

    public function store(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('comment', $snag);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $targetUser = User::query()->findOrFail((int) $validated['user_id']);
        if (! $targetUser->organizations()->where('organizations.id', $snag->organization_id)->wherePivot('is_active', true)->exists()) {
            abort(422, 'User is not an active member of this organization.');
        }

        $this->snagCollaborationService->addWatchers(
            $snag,
            [$targetUser->id],
            SnagCollaborationService::WATCH_SOURCE_MANUAL,
            $request->user()->id,
        );

        $watcher = $snag->watchers()
            ->with(['user:id,name,email', 'creator:id,name,email'])
            ->where('user_id', $targetUser->id)
            ->first();

        return response()->json([
            'data' => $watcher,
        ], 201);
    }

    public function destroy(Request $request, Snag $snag, User $user): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);

        if ($request->user()->id !== $user->id) {
            $this->authorize('comment', $snag);
        } else {
            $this->authorize('view', $snag);
        }

        $this->snagCollaborationService->removeWatcher($snag, $user->id);

        return response()->json([
            'message' => 'Watcher removed.',
        ]);
    }
}

