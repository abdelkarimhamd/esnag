<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class ProjectPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('projects.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'projects.view');
    }

    public function view(User $user, Project $project): bool
    {
        return $this->belongsToOrganization($user, $project->organization_id)
            && $this->hasScopedPermission($user, $project->organization_id, $project->id, 'projects.view');
    }

    public function create(User $user): bool
    {
        return $user->can('projects.manage');
    }

    public function update(User $user, Project $project): bool
    {
        return $this->belongsToOrganization($user, $project->organization_id)
            && $this->hasScopedPermission($user, $project->organization_id, $project->id, 'projects.manage');
    }

    public function delete(User $user, Project $project): bool
    {
        return $this->belongsToOrganization($user, $project->organization_id)
            && $this->hasScopedPermission($user, $project->organization_id, $project->id, 'projects.manage');
    }
}
