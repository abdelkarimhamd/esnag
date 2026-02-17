<?php

namespace App\Services;

use App\Models\DelegationRule;
use App\Models\ProjectUserRole;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;

use function getPermissionsTeamId;
use function setPermissionsTeamId;

class AccessControlService
{
    /**
     * @return array<int, string>
     */
    public function effectiveRoleNames(User $user, int $organizationId, ?int $projectId = null): array
    {
        if ($projectId !== null) {
            $projectRoles = ProjectUserRole::query()
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->where('user_id', $user->id)
                ->orderBy('role_name')
                ->pluck('role_name')
                ->unique()
                ->values()
                ->all();

            if ($projectRoles !== []) {
                return $projectRoles;
            }
        }

        return $user->roleNamesForOrganization($organizationId);
    }

    /**
     * @return array<int, string>
     */
    public function effectivePermissionNames(User $user, int $organizationId, ?int $projectId = null): array
    {
        $roles = $this->effectiveRoleNames($user, $organizationId, $projectId);

        if ($projectId !== null && $this->hasProjectRoleOverrides($user, $organizationId, $projectId)) {
            $cacheKey = sprintf('rbac:project_permissions:%d:%d:%d', $organizationId, $projectId, $user->id);

            return Cache::remember($cacheKey, now()->addMinutes(5), function () use ($organizationId, $roles): array {
                if ($roles === []) {
                    return [];
                }

                return Role::query()
                    ->where('organization_id', $organizationId)
                    ->whereIn('name', $roles)
                    ->with('permissions:id,name')
                    ->get()
                    ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
                    ->unique()
                    ->sort()
                    ->values()
                    ->all();
            });
        }

        $previous = getPermissionsTeamId();
        setPermissionsTeamId($organizationId);

        try {
            return $user->getAllPermissions()
                ->pluck('name')
                ->unique()
                ->sort()
                ->values()
                ->all();
        } finally {
            setPermissionsTeamId($previous);
        }
    }

    public function allows(User $user, int $organizationId, ?int $projectId, string $permission): bool
    {
        if ($this->allowsWithoutDelegation($user, $organizationId, $projectId, $permission)) {
            return true;
        }

        return $this->delegatedFrom($user, $organizationId, $projectId, $permission) !== null;
    }

    public function allowsWithoutDelegation(User $user, int $organizationId, ?int $projectId, string $permission): bool
    {
        return in_array($permission, $this->effectivePermissionNames($user, $organizationId, $projectId), true);
    }

    public function hasProjectRoleOverrides(User $user, int $organizationId, int $projectId): bool
    {
        return ProjectUserRole::query()
            ->where('organization_id', $organizationId)
            ->where('project_id', $projectId)
            ->where('user_id', $user->id)
            ->exists();
    }

    public function hasAnyProjectScopedPermission(User $user, int $organizationId, string $permission): bool
    {
        $roles = ProjectUserRole::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->pluck('role_name')
            ->unique()
            ->values()
            ->all();

        if ($roles === []) {
            return false;
        }

        return Role::query()
            ->where('organization_id', $organizationId)
            ->whereIn('name', $roles)
            ->whereHas('permissions', function ($query) use ($permission): void {
                $query->where('name', $permission);
            })
            ->exists();
    }

    /**
     * @return array<int, string>
     */
    public function projectScopedPermissionNames(User $user, int $organizationId): array
    {
        $roleNames = ProjectUserRole::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->pluck('role_name')
            ->unique()
            ->values()
            ->all();

        if ($roleNames === []) {
            return [];
        }

        return Role::query()
            ->where('organization_id', $organizationId)
            ->whereIn('name', $roleNames)
            ->with('permissions:id,name')
            ->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    /**
     * @return array<int, int>
     */
    public function projectIdsWithPermission(User $user, int $organizationId, string $permission): array
    {
        $assignments = ProjectUserRole::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->get(['project_id', 'role_name']);

        if ($assignments->isEmpty()) {
            return [];
        }

        $allowedRoleNames = Role::query()
            ->where('organization_id', $organizationId)
            ->whereIn('name', $assignments->pluck('role_name')->unique()->values()->all())
            ->whereHas('permissions', function ($query) use ($permission): void {
                $query->where('name', $permission);
            })
            ->pluck('name')
            ->unique()
            ->values()
            ->all();

        if ($allowedRoleNames === []) {
            return [];
        }

        return $assignments
            ->filter(fn ($assignment) => in_array($assignment->role_name, $allowedRoleNames, true))
            ->pluck('project_id')
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    public function delegatedFrom(User $delegate, int $organizationId, ?int $projectId, string $permission): ?User
    {
        $permissionScope = $this->permissionScope($permission);
        if (! $permissionScope) {
            return null;
        }

        $rules = $this->activeDelegationRules($delegate->id, $organizationId, $projectId);

        foreach ($rules as $rule) {
            if (! $this->scopeAllows($rule, $permissionScope)) {
                continue;
            }

            $delegator = $rule->delegator;
            if (! $delegator) {
                continue;
            }

            $targetProjectId = $projectId ?? $rule->project_id;
            if ($targetProjectId !== null && $rule->project_id !== null && $rule->project_id !== $targetProjectId) {
                continue;
            }

            if ($this->allowsWithoutDelegation($delegator, $organizationId, $targetProjectId, $permission)) {
                return $delegator;
            }
        }

        return null;
    }

    /**
     * @return Collection<int, DelegationRule>
     */
    public function activeDelegationRules(int $delegateUserId, int $organizationId, ?int $projectId = null): Collection
    {
        return DelegationRule::query()
            ->with('delegator')
            ->where('organization_id', $organizationId)
            ->where('delegate_user_id', $delegateUserId)
            ->where('is_active', true)
            ->where('starts_at', '<=', now())
            ->where('ends_at', '>=', now())
            ->when($projectId !== null, function ($query) use ($projectId): void {
                $query->where(function ($builder) use ($projectId): void {
                    $builder->whereNull('project_id')
                        ->orWhere('project_id', $projectId);
                });
            })
            ->orderBy('starts_at')
            ->get();
    }

    private function scopeAllows(DelegationRule $rule, string $permissionScope): bool
    {
        return match ($rule->scope) {
            DelegationRule::SCOPE_ALL => in_array($permissionScope, [DelegationRule::SCOPE_ASSIGNMENTS, DelegationRule::SCOPE_APPROVALS], true),
            DelegationRule::SCOPE_ASSIGNMENTS => $permissionScope === DelegationRule::SCOPE_ASSIGNMENTS,
            DelegationRule::SCOPE_APPROVALS => $permissionScope === DelegationRule::SCOPE_APPROVALS,
            default => false,
        };
    }

    private function permissionScope(string $permission): ?string
    {
        if (in_array($permission, ['snags.assign', 'snags.transition', 'inspections.requests.manage'], true)) {
            return DelegationRule::SCOPE_ASSIGNMENTS;
        }

        if (in_array($permission, ['inspections.approvals.review', 'inspections.signatures.sign'], true)) {
            return DelegationRule::SCOPE_APPROVALS;
        }

        return null;
    }
}
