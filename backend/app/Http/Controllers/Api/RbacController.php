<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\PermissionPreset;
use App\Models\Project;
use App\Models\ProjectUserRole;
use App\Models\User;
use App\Services\AccessControlService;
use App\Support\PermissionCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

class RbacController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function context(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $user = $request->user();

        $project = null;
        if ($projectId = $request->integer('project_id')) {
            $project = Project::query()->findOrFail($projectId);
            if ($project->organization_id !== $organization->id) {
                abort(404);
            }

            if (
                ! $this->accessControlService->allows($user, $organization->id, $project->id, 'projects.view')
                && ! $this->accessControlService->allows($user, $organization->id, $project->id, 'snags.view')
            ) {
                abort(403);
            }
        }

        $roles = $this->accessControlService->effectiveRoleNames($user, $organization->id, $project?->id);
        $permissions = $this->accessControlService->effectivePermissionNames($user, $organization->id, $project?->id);

        $delegations = $this->accessControlService
            ->activeDelegationRules($user->id, $organization->id, $project?->id)
            ->map(function ($rule) {
                return [
                    'id' => $rule->id,
                    'scope' => $rule->scope,
                    'project_id' => $rule->project_id,
                    'starts_at' => $rule->starts_at,
                    'ends_at' => $rule->ends_at,
                    'delegator' => $rule->delegator
                        ? [
                            'id' => $rule->delegator->id,
                            'name' => $rule->delegator->name,
                            'email' => $rule->delegator->email,
                        ]
                        : null,
                ];
            })
            ->values();

        return response()->json([
            'data' => [
                'organization_id' => $organization->id,
                'project' => $project ? [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                ] : null,
                'roles' => $roles,
                'permissions' => $permissions,
                'has_project_override' => $project
                    ? $this->accessControlService->hasProjectRoleOverrides($user, $organization->id, $project->id)
                    : false,
                'delegations' => $delegations,
            ],
        ]);
    }

    public function projectRoles(Request $request, Project $project): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if ($project->organization_id !== $organization->id) {
            abort(404);
        }

        if (! $this->accessControlService->allows($request->user(), $organization->id, $project->id, 'projects.view')) {
            abort(403);
        }

        $members = $organization->users()
            ->wherePivot('is_active', true)
            ->orderBy('users.name')
            ->get(['users.id', 'users.name', 'users.email'])
            ->map(function (User $member) use ($organization, $project) {
                $orgRoles = $member->roleNamesForOrganization($organization->id);
                $projectRoles = ProjectUserRole::query()
                    ->where('organization_id', $organization->id)
                    ->where('project_id', $project->id)
                    ->where('user_id', $member->id)
                    ->orderBy('role_name')
                    ->pluck('role_name')
                    ->values()
                    ->all();

                return [
                    'id' => $member->id,
                    'name' => $member->name,
                    'email' => $member->email,
                    'org_roles' => $orgRoles,
                    'project_roles' => $projectRoles,
                    'effective_roles' => $this->accessControlService->effectiveRoleNames($member, $organization->id, $project->id),
                    'effective_permissions' => $this->accessControlService->effectivePermissionNames($member, $organization->id, $project->id),
                ];
            })
            ->values();

        return response()->json([
            'data' => [
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                ],
                'members' => $members,
            ],
        ]);
    }

    public function upsertProjectUserRoles(Request $request, Project $project, User $user): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if ($project->organization_id !== $organization->id) {
            abort(404);
        }

        if (! $this->accessControlService->allows($request->user(), $organization->id, $project->id, 'projects.manage')) {
            abort(403);
        }

        if (! $user->organizations()->where('organizations.id', $organization->id)->where('organization_user.is_active', true)->exists()) {
            abort(422, 'User is not an active organization member.');
        }

        $validRoles = array_keys(PermissionCatalog::roleMap());
        $validated = $request->validate([
            'roles' => ['array'],
            'roles.*' => ['string', 'in:'.implode(',', $validRoles)],
        ]);

        $roles = collect($validated['roles'] ?? [])->unique()->values();

        DB::transaction(function () use ($organization, $project, $user, $roles): void {
            ProjectUserRole::query()
                ->where('organization_id', $organization->id)
                ->where('project_id', $project->id)
                ->where('user_id', $user->id)
                ->delete();

            foreach ($roles as $roleName) {
                ProjectUserRole::query()->create([
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'user_id' => $user->id,
                    'role_name' => $roleName,
                    'source' => 'manual',
                ]);
            }

            Cache::forget(sprintf('rbac:project_permissions:%d:%d:%d', $organization->id, $project->id, $user->id));
        });

        return response()->json([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                ],
                'org_roles' => $user->roleNamesForOrganization($organization->id),
                'project_roles' => ProjectUserRole::query()
                    ->where('organization_id', $organization->id)
                    ->where('project_id', $project->id)
                    ->where('user_id', $user->id)
                    ->orderBy('role_name')
                    ->pluck('role_name')
                    ->values(),
                'effective_roles' => $this->accessControlService->effectiveRoleNames($user, $organization->id, $project->id),
                'effective_permissions' => $this->accessControlService->effectivePermissionNames($user, $organization->id, $project->id),
            ],
        ]);
    }

    public function presets(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        if (! $request->user()->hasPermissionInOrganization($organization->id, 'projects.view')) {
            abort(403);
        }

        $presets = PermissionPreset::query()
            ->where(function ($query) use ($organization): void {
                $query->whereNull('organization_id')
                    ->orWhere('organization_id', $organization->id);
            })
            ->with('permissions')
            ->orderByDesc('is_system')
            ->orderBy('name')
            ->get()
            ->map(function (PermissionPreset $preset) {
                $permissionNames = $preset->permissions
                    ->pluck('permission_name')
                    ->unique()
                    ->sort()
                    ->values();

                return [
                    'id' => $preset->id,
                    'preset_key' => $preset->preset_key,
                    'name' => $preset->name,
                    'description' => $preset->description,
                    'is_system' => $preset->is_system,
                    'permissions' => $permissionNames,
                    'permissions_count' => $permissionNames->count(),
                ];
            })
            ->values();

        return response()->json([
            'data' => $presets,
        ]);
    }

    public function permissionDiff(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'preset_key' => ['required', 'string', 'max:120'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'role_name' => ['nullable', 'string', 'max:120'],
        ]);

        $project = null;
        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            if ($project->organization_id !== $organization->id) {
                abort(404);
            }
        }

        if (
            ! $request->user()->hasPermissionInOrganization($organization->id, 'projects.view')
            && ! ($project && $this->accessControlService->allows($request->user(), $organization->id, $project->id, 'projects.view'))
        ) {
            abort(403);
        }

        $preset = PermissionPreset::query()
            ->where('preset_key', $validated['preset_key'])
            ->where(function ($query) use ($organization): void {
                $query->whereNull('organization_id')
                    ->orWhere('organization_id', $organization->id);
            })
            ->with('permissions')
            ->first();

        if (! $preset) {
            abort(404, 'Preset not found.');
        }

        $presetPermissions = $preset->permissions
            ->pluck('permission_name')
            ->unique()
            ->sort()
            ->values();

        $targetType = 'current_user';
        $targetLabel = $request->user()->name;
        $currentPermissions = collect(
            $this->accessControlService->effectivePermissionNames($request->user(), $organization->id, $project?->id)
        );

        if (! empty($validated['user_id'])) {
            $targetUser = User::query()->findOrFail($validated['user_id']);
            if (! $targetUser->organizations()->where('organizations.id', $organization->id)->where('organization_user.is_active', true)->exists()) {
                abort(422, 'Target user is not an active organization member.');
            }

            $targetType = 'user';
            $targetLabel = $targetUser->name;
            $currentPermissions = collect(
                $this->accessControlService->effectivePermissionNames($targetUser, $organization->id, $project?->id)
            );
        }

        if (! empty($validated['role_name'])) {
            $targetType = 'role';
            $targetLabel = $validated['role_name'];

            $role = Role::query()
                ->where('organization_id', $organization->id)
                ->where('name', $validated['role_name'])
                ->with('permissions')
                ->first();

            $currentPermissions = $role
                ? $role->permissions->pluck('name')->unique()->sort()->values()
                : collect(PermissionCatalog::roleMap()[$validated['role_name']] ?? [])->unique()->sort()->values();
        }

        $missing = $presetPermissions->diff($currentPermissions)->values();
        $extra = $currentPermissions->diff($presetPermissions)->values();
        $matching = $presetPermissions->intersect($currentPermissions)->values();

        return response()->json([
            'data' => [
                'preset' => [
                    'id' => $preset->id,
                    'preset_key' => $preset->preset_key,
                    'name' => $preset->name,
                ],
                'project' => $project ? [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                ] : null,
                'target' => [
                    'type' => $targetType,
                    'label' => $targetLabel,
                ],
                'preset_permissions' => $presetPermissions,
                'current_permissions' => $currentPermissions->values(),
                'matching_permissions' => $matching,
                'missing_permissions' => $missing,
                'extra_permissions' => $extra,
                'stats' => [
                    'preset_count' => $presetPermissions->count(),
                    'current_count' => $currentPermissions->count(),
                    'matching_count' => $matching->count(),
                    'missing_count' => $missing->count(),
                    'extra_count' => $extra->count(),
                ],
            ],
        ]);
    }
}
