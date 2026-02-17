<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\RootCauseCategory;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RootCauseCategoryController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if (! $this->canManage($request)) {
            $categories = RootCauseCategory::query()
                ->where('organization_id', $organization->id)
                ->where('is_active', true)
                ->orderBy('name')
                ->get();

            return response()->json([
                'data' => $categories,
            ]);
        }

        $categories = RootCauseCategory::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $categories,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->canManage($request)) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $category = RootCauseCategory::query()->create([
            'organization_id' => $organization->id,
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $category,
        ], 201);
    }

    public function update(Request $request, RootCauseCategory $rootCauseCategory): JsonResponse
    {
        $this->assertOrganization($rootCauseCategory->organization_id, $request);
        if (! $this->canManage($request)) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $rootCauseCategory->fill($validated);
        $rootCauseCategory->save();

        return response()->json([
            'data' => $rootCauseCategory,
        ]);
    }

    private function canManage(Request $request): bool
    {
        $organization = $this->currentOrganization($request);
        $user = $request->user();

        if ($this->accessControlService->allows($user, $organization->id, null, 'projects.manage')) {
            return true;
        }

        $roles = $this->accessControlService->effectiveRoleNames($user, $organization->id);

        return in_array('org_admin', $roles, true) || in_array('owner', $roles, true);
    }
}

