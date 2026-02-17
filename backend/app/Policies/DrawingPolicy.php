<?php

namespace App\Policies;

use App\Models\Drawing;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class DrawingPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('drawings.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'drawings.view');
    }

    public function view(User $user, Drawing $drawing): bool
    {
        return $this->belongsToOrganization($user, $drawing->organization_id)
            && $this->hasScopedPermission($user, $drawing->organization_id, $drawing->project_id, 'drawings.view');
    }

    public function create(User $user): bool
    {
        return $user->can('drawings.manage')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'drawings.manage');
    }

    public function update(User $user, Drawing $drawing): bool
    {
        return $this->belongsToOrganization($user, $drawing->organization_id)
            && $this->hasScopedPermission($user, $drawing->organization_id, $drawing->project_id, 'drawings.manage');
    }

    public function delete(User $user, Drawing $drawing): bool
    {
        return $this->belongsToOrganization($user, $drawing->organization_id)
            && $this->hasScopedPermission($user, $drawing->organization_id, $drawing->project_id, 'drawings.manage');
    }
}
