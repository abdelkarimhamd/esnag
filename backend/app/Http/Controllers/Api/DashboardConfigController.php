<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\DashboardConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardConfigController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('dashboard.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $configs = DashboardConfig::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $request->user()->id)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $configs,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $request->user()->can('dashboard.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'is_default' => ['sometimes', 'boolean'],
            'cards' => ['required', 'array', 'min:1'],
            'cards.*' => ['required', 'string', 'max:80'],
            'filters' => ['nullable', 'array'],
            'layout' => ['nullable', 'array'],
        ]);

        if (! empty($validated['is_default'])) {
            DashboardConfig::query()
                ->where('organization_id', $organization->id)
                ->where('user_id', $request->user()->id)
                ->update(['is_default' => false]);
        }

        $config = DashboardConfig::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'is_default' => (bool) ($validated['is_default'] ?? false),
            'cards' => $validated['cards'],
            'filters' => $validated['filters'] ?? null,
            'layout' => $validated['layout'] ?? null,
        ]);

        return response()->json([
            'data' => $config,
        ], 201);
    }

    public function update(Request $request, DashboardConfig $dashboardConfig): JsonResponse
    {
        $this->assertOrganization($dashboardConfig->organization_id, $request);
        if (! $request->user()->can('dashboard.view') || $dashboardConfig->user_id !== $request->user()->id) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'is_default' => ['sometimes', 'boolean'],
            'cards' => ['sometimes', 'required', 'array', 'min:1'],
            'cards.*' => ['required', 'string', 'max:80'],
            'filters' => ['nullable', 'array'],
            'layout' => ['nullable', 'array'],
        ]);

        if (! empty($validated['is_default'])) {
            DashboardConfig::query()
                ->where('organization_id', $dashboardConfig->organization_id)
                ->where('user_id', $dashboardConfig->user_id)
                ->where('id', '!=', $dashboardConfig->id)
                ->update(['is_default' => false]);
        }

        $dashboardConfig->fill($validated);
        $dashboardConfig->save();

        return response()->json([
            'data' => $dashboardConfig,
        ]);
    }

    public function destroy(Request $request, DashboardConfig $dashboardConfig): JsonResponse
    {
        $this->assertOrganization($dashboardConfig->organization_id, $request);
        if (! $request->user()->can('dashboard.view') || $dashboardConfig->user_id !== $request->user()->id) {
            abort(403);
        }

        $dashboardConfig->delete();

        return response()->json([
            'message' => 'Dashboard config deleted.',
        ]);
    }
}

