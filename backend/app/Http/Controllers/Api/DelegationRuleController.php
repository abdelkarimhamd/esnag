<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\DelegationRule;
use App\Models\Project;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DelegationRuleController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $projectId = $request->integer('project_id') ?: null;

        $this->assertCanManageDelegations($request, $organization->id, $projectId);

        $query = DelegationRule::query()
            ->where('organization_id', $organization->id)
            ->with(['delegator:id,name,email', 'delegate:id,name,email', 'project:id,name,code', 'creator:id,name,email'])
            ->orderByDesc('created_at');

        if ($projectId !== null) {
            $query->where(function ($builder) use ($projectId): void {
                $builder->whereNull('project_id')
                    ->orWhere('project_id', $projectId);
            });
        }

        if ($scope = $request->string('scope')->toString()) {
            $query->where('scope', $scope);
        }

        if ($activeOnly = $request->boolean('active_only', true)) {
            $query->where('is_active', true)
                ->where('starts_at', '<=', now())
                ->where('ends_at', '>=', now());
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'delegator_user_id' => ['required', 'integer', 'exists:users,id'],
            'delegate_user_id' => ['required', 'integer', 'exists:users,id', 'different:delegator_user_id'],
            'scope' => ['required', 'in:all,assignments,approvals'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'reason' => ['nullable', 'string', 'max:1500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $project = null;
        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            if ($project->organization_id !== $organization->id) {
                abort(404);
            }
        }

        $this->assertCanManageDelegations($request, $organization->id, $project?->id);

        $delegator = $organization->users()
            ->wherePivot('is_active', true)
            ->where('users.id', $validated['delegator_user_id'])
            ->first();

        if (! $delegator) {
            abort(422, 'Delegator must be an active organization member.');
        }

        $delegate = $organization->users()
            ->wherePivot('is_active', true)
            ->where('users.id', $validated['delegate_user_id'])
            ->first();

        if (! $delegate) {
            abort(422, 'Delegate must be an active organization member.');
        }

        $rule = DelegationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project?->id,
            'delegator_user_id' => $delegator->id,
            'delegate_user_id' => $delegate->id,
            'scope' => $validated['scope'],
            'starts_at' => $validated['starts_at'],
            'ends_at' => $validated['ends_at'],
            'reason' => $validated['reason'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $rule->load(['delegator:id,name,email', 'delegate:id,name,email', 'project:id,name,code', 'creator:id,name,email']),
        ], 201);
    }

    public function destroy(Request $request, DelegationRule $delegationRule): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if ($delegationRule->organization_id !== $organization->id) {
            abort(404);
        }

        $this->assertCanManageDelegations($request, $organization->id, $delegationRule->project_id);

        $delegationRule->delete();

        return response()->json([
            'message' => 'Delegation rule deleted.',
        ]);
    }

    private function assertCanManageDelegations(Request $request, int $organizationId, ?int $projectId): void
    {
        $user = $request->user();

        if ($projectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organizationId, $projectId, 'projects.manage')
                && ! $this->accessControlService->allows($user, $organizationId, $projectId, 'snags.assign')
                && ! $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.approvals.review')
            ) {
                abort(403);
            }

            return;
        }

        if (! $user->hasPermissionInOrganization($organizationId, 'projects.manage')) {
            abort(403);
        }
    }
}
