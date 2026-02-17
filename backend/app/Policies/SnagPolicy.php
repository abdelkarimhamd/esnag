<?php

namespace App\Policies;

use App\Models\Snag;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class SnagPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('snags.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'snags.view');
    }

    public function view(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.view');
    }

    public function create(User $user): bool
    {
        return $user->can('snags.create')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'snags.create');
    }

    public function update(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.update');
    }

    public function delete(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.delete');
    }

    public function assign(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.assign');
    }

    public function transition(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.transition');
    }

    public function comment(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.comment');
    }

    public function attach(User $user, Snag $snag): bool
    {
        return $this->belongsToOrganization($user, $snag->organization_id)
            && $this->hasScopedPermission($user, $snag->organization_id, $snag->project_id, 'snags.attach');
    }
}
