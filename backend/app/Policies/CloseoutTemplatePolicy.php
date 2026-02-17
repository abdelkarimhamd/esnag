<?php

namespace App\Policies;

use App\Models\CloseoutTemplate;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class CloseoutTemplatePolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('closeout.templates.view')
            || $user->can('projects.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'closeout.templates.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'projects.view');
    }

    public function view(User $user, CloseoutTemplate $closeoutTemplate): bool
    {
        if (! $this->belongsToOrganization($user, $closeoutTemplate->organization_id)) {
            return false;
        }

        return $this->hasScopedPermission($user, $closeoutTemplate->organization_id, $closeoutTemplate->project_id, 'closeout.templates.view')
            || $this->hasScopedPermission($user, $closeoutTemplate->organization_id, $closeoutTemplate->project_id, 'projects.view');
    }

    public function create(User $user): bool
    {
        return $user->can('closeout.templates.manage')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'closeout.templates.manage');
    }

    public function update(User $user, CloseoutTemplate $closeoutTemplate): bool
    {
        return $this->belongsToOrganization($user, $closeoutTemplate->organization_id)
            && $this->hasScopedPermission($user, $closeoutTemplate->organization_id, $closeoutTemplate->project_id, 'closeout.templates.manage');
    }

    public function delete(User $user, CloseoutTemplate $closeoutTemplate): bool
    {
        return $this->belongsToOrganization($user, $closeoutTemplate->organization_id)
            && $this->hasScopedPermission($user, $closeoutTemplate->organization_id, $closeoutTemplate->project_id, 'closeout.templates.manage');
    }
}
