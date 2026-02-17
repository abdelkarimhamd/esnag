<?php

namespace App\Policies;

use App\Models\InspectionSubmission;
use App\Models\User;
use App\Policies\Concerns\ChecksScopedPermissions;

class InspectionSubmissionPolicy
{
    use ChecksScopedPermissions;

    public function viewAny(User $user): bool
    {
        return $user->can('inspections.submissions.view')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.submissions.view');
    }

    public function view(User $user, InspectionSubmission $inspectionSubmission): bool
    {
        return $this->belongsToOrganization($user, $inspectionSubmission->organization_id)
            && $this->hasScopedPermission($user, $inspectionSubmission->organization_id, $inspectionSubmission->project_id, 'inspections.submissions.view');
    }

    public function create(User $user): bool
    {
        return $user->can('inspections.submissions.create')
            || $this->hasAnyProjectPermissionAcrossOrganizations($user, 'inspections.submissions.create');
    }

    public function update(User $user, InspectionSubmission $inspectionSubmission): bool
    {
        return $this->belongsToOrganization($user, $inspectionSubmission->organization_id)
            && $this->hasScopedPermission($user, $inspectionSubmission->organization_id, $inspectionSubmission->project_id, 'inspections.submissions.update');
    }

    public function submit(User $user, InspectionSubmission $inspectionSubmission): bool
    {
        return $this->belongsToOrganization($user, $inspectionSubmission->organization_id)
            && $this->hasScopedPermission($user, $inspectionSubmission->organization_id, $inspectionSubmission->project_id, 'inspections.submissions.submit');
    }

    public function approve(User $user, InspectionSubmission $inspectionSubmission): bool
    {
        return $this->belongsToOrganization($user, $inspectionSubmission->organization_id)
            && $this->hasScopedPermission($user, $inspectionSubmission->organization_id, $inspectionSubmission->project_id, 'inspections.approvals.review');
    }

    public function sign(User $user, InspectionSubmission $inspectionSubmission): bool
    {
        return $this->belongsToOrganization($user, $inspectionSubmission->organization_id)
            && $this->hasScopedPermission($user, $inspectionSubmission->organization_id, $inspectionSubmission->project_id, 'inspections.signatures.sign');
    }
}
