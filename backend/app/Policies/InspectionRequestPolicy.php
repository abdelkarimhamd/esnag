<?php

namespace App\Policies;

use App\Models\InspectionRequest;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class InspectionRequestPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('inspections.requests.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.requests.view');
    }

    public function view(User $user, InspectionRequest $inspectionRequest): bool
    {
        return $this->belongsToOrganization($user, $inspectionRequest->organization_id)
            && $this->hasScopedPermission($user, $inspectionRequest->organization_id, $inspectionRequest->project_id, 'inspections.requests.view');
    }

    public function create(User $user): bool
    {
        return $user->can('inspections.requests.manage')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.requests.manage');
    }

    public function update(User $user, InspectionRequest $inspectionRequest): bool
    {
        return $this->belongsToOrganization($user, $inspectionRequest->organization_id)
            && $this->hasScopedPermission($user, $inspectionRequest->organization_id, $inspectionRequest->project_id, 'inspections.requests.manage');
    }
}
