<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\MobileAuthDevice;
use App\Services\MobileDeviceSecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileAuthDeviceController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly MobileDeviceSecurityService $mobileDeviceSecurityService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $this->currentOrganization($request);

        $devices = MobileAuthDevice::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('last_seen_at')
            ->get();

        return response()->json([
            'data' => $devices,
        ]);
    }

    public function destroy(Request $request, MobileAuthDevice $mobileAuthDevice): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $this->currentOrganization($request);

        $updated = $this->mobileDeviceSecurityService->revokeDevice($request->user(), $mobileAuthDevice);

        return response()->json([
            'data' => $updated,
            'message' => 'Mobile auth device revoked.',
        ]);
    }
}

