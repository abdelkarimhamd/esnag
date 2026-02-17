<?php

namespace App\Policies\Concerns;

use App\Models\User;
use App\Services\AccessControlService;
use Spatie\Permission\Models\Role;

trait ChecksScopedPermissions
{
    protected function belongsToOrganization(User $user, int $organizationId): bool
    {
        return $user->organizations()->where('organizations.id', $organizationId)->exists();
    }

    protected function hasScopedPermission(User $user, int $organizationId, ?int $projectId, string $permission): bool
    {
        return app(AccessControlService::class)->allows($user, $organizationId, $projectId, $permission);
    }

    protected function hasAnyProjectPermission(User $user, int $organizationId, string $permission): bool
    {
        return app(AccessControlService::class)->hasAnyProjectScopedPermission($user, $organizationId, $permission);
    }

    protected function hasAnyProjectPermissionAcrossOrganizations(User $user, string $permission): bool
    {
        $roleNames = $user->projectRoleAssignments()
            ->pluck('role_name')
            ->unique()
            ->values()
            ->all();

        if ($roleNames === []) {
            return false;
        }

        return Role::query()
            ->whereIn('name', $roleNames)
            ->whereHas('permissions', function ($query) use ($permission): void {
                $query->where('name', $permission);
            })
            ->exists();
    }
}
