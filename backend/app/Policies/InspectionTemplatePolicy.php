<?php

namespace App\Policies;

use App\Models\InspectionTemplate;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class InspectionTemplatePolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('inspections.templates.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.templates.view');
    }

    public function view(User $user, InspectionTemplate $inspectionTemplate): bool
    {
        return $this->belongsToOrganization($user, $inspectionTemplate->organization_id)
            && $this->hasScopedPermission($user, $inspectionTemplate->organization_id, $inspectionTemplate->project_id, 'inspections.templates.view');
    }

    public function create(User $user): bool
    {
        return $user->can('inspections.templates.manage')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.templates.manage');
    }

    public function update(User $user, InspectionTemplate $inspectionTemplate): bool
    {
        return $this->belongsToOrganization($user, $inspectionTemplate->organization_id)
            && $this->hasScopedPermission($user, $inspectionTemplate->organization_id, $inspectionTemplate->project_id, 'inspections.templates.manage');
    }

    public function delete(User $user, InspectionTemplate $inspectionTemplate): bool
    {
        return $this->belongsToOrganization($user, $inspectionTemplate->organization_id)
            && $this->hasScopedPermission($user, $inspectionTemplate->organization_id, $inspectionTemplate->project_id, 'inspections.templates.manage');
    }
}
