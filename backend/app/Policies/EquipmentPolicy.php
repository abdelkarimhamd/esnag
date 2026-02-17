<?php

namespace App\Policies;

use App\Models\Equipment;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class EquipmentPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('equipment.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'equipment.view');
    }

    public function view(User $user, Equipment $equipment): bool
    {
        return $this->belongsToOrganization($user, $equipment->organization_id)
            && $this->hasScopedPermission($user, $equipment->organization_id, $equipment->project_id, 'equipment.view');
    }

    public function create(User $user): bool
    {
        return $user->can('equipment.manage')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'equipment.manage');
    }

    public function update(User $user, Equipment $equipment): bool
    {
        return $this->belongsToOrganization($user, $equipment->organization_id)
            && $this->hasScopedPermission($user, $equipment->organization_id, $equipment->project_id, 'equipment.manage');
    }

    public function delete(User $user, Equipment $equipment): bool
    {
        return $this->belongsToOrganization($user, $equipment->organization_id)
            && $this->hasScopedPermission($user, $equipment->organization_id, $equipment->project_id, 'equipment.manage');
    }

    public function logMaintenance(User $user, Equipment $equipment): bool
    {
        return $this->belongsToOrganization($user, $equipment->organization_id)
            && $this->hasScopedPermission($user, $equipment->organization_id, $equipment->project_id, 'equipment.maintenance.log');
    }
}
