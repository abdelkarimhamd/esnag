<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\MobileDeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MobilePushTokenController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $tokens = MobileDeviceToken::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $request->user()->id)
            ->orderByDesc('last_seen_at')
            ->get();

        return response()->json([
            'data' => $tokens,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'push_token' => ['required', 'string', 'max:255'],
            'platform' => ['nullable', 'string', 'max:40'],
            'device_name' => ['nullable', 'string', 'max:255'],
            'app_version' => ['nullable', 'string', 'max:80'],
        ]);

        $token = MobileDeviceToken::query()->updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'push_token' => $validated['push_token'],
            ],
            [
                'organization_id' => $organization->id,
                'platform' => $validated['platform'] ?? 'expo',
                'device_name' => $validated['device_name'] ?? null,
                'app_version' => $validated['app_version'] ?? null,
                'is_active' => true,
                'last_seen_at' => Carbon::now(),
            ]
        );

        return response()->json([
            'data' => $token,
        ], 201);
    }

    public function destroy(Request $request, string $tokenId): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $token = MobileDeviceToken::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $request->user()->id)
            ->where('id', (int) $tokenId)
            ->firstOrFail();

        $token->is_active = false;
        $token->last_seen_at = Carbon::now();
        $token->save();

        return response()->json([
            'message' => 'Push token deactivated.',
        ]);
    }
}
