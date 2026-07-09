<?php

namespace App\Models;

use App\Services\AccessControlService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

use function getPermissionsTeamId;
use function setPermissionsTeamId;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'mfa_enabled',
        'mfa_secret',
        'mfa_recovery_codes',
        'mfa_reset_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'mfa_secret',
        'mfa_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'mfa_enabled' => 'boolean',
            'mfa_recovery_codes' => 'array',
            'mfa_reset_at' => 'datetime',
        ];
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class)
            ->withPivot(['employee_code', 'job_title', 'is_active', 'joined_at'])
            ->withTimestamps();
    }

    public function requestedExports(): HasMany
    {
        return $this->hasMany(ExportJob::class, 'requested_by');
    }

    public function createdInspectionTemplates(): HasMany
    {
        return $this->hasMany(InspectionTemplate::class, 'created_by');
    }

    public function createdInspectionSubmissions(): HasMany
    {
        return $this->hasMany(InspectionSubmission::class, 'created_by');
    }

    public function submittedInspectionSubmissions(): HasMany
    {
        return $this->hasMany(InspectionSubmission::class, 'submitted_by');
    }

    public function inspectionApprovals(): HasMany
    {
        return $this->hasMany(InspectionApproval::class, 'approver_id');
    }

    public function inspectionSignatures(): HasMany
    {
        return $this->hasMany(InspectionSignature::class, 'signed_by');
    }

    public function requestedInspectionRequests(): HasMany
    {
        return $this->hasMany(InspectionRequest::class, 'requested_by');
    }

    public function assignedInspectionRequests(): HasMany
    {
        return $this->hasMany(InspectionRequest::class, 'assigned_to');
    }

    public function mobileDeviceTokens(): HasMany
    {
        return $this->hasMany(MobileDeviceToken::class);
    }

    public function mobileAuthDevices(): HasMany
    {
        return $this->hasMany(MobileAuthDevice::class);
    }

    public function notificationPreferences(): HasMany
    {
        return $this->hasMany(NotificationPreference::class);
    }

    public function dashboardConfigs(): HasMany
    {
        return $this->hasMany(DashboardConfig::class);
    }

    public function equipmentMaintenanceLogs(): HasMany
    {
        return $this->hasMany(EquipmentMaintenanceLog::class, 'performed_by');
    }

    public function snagComments(): HasMany
    {
        return $this->hasMany(SnagComment::class);
    }

    public function snagWatchers(): HasMany
    {
        return $this->hasMany(SnagWatcher::class);
    }

    public function snagEscalationsReceived(): HasMany
    {
        return $this->hasMany(SnagEscalation::class, 'escalated_to_user_id');
    }

    public function inspectionApprovalMessages(): HasMany
    {
        return $this->hasMany(InspectionApprovalMessage::class);
    }

    public function workflowAutomationRulesCreated(): HasMany
    {
        return $this->hasMany(WorkflowAutomationRule::class, 'created_by');
    }

    public function workflowAutomationRulesUpdated(): HasMany
    {
        return $this->hasMany(WorkflowAutomationRule::class, 'updated_by');
    }

    public function workflowAutomationLogsTriggered(): HasMany
    {
        return $this->hasMany(WorkflowAutomationLog::class, 'triggered_by');
    }

    public function snagReminderPoliciesCreated(): HasMany
    {
        return $this->hasMany(SnagReminderPolicy::class, 'created_by');
    }

    public function snagReminderPoliciesUpdated(): HasMany
    {
        return $this->hasMany(SnagReminderPolicy::class, 'updated_by');
    }

    public function snagReminderLogs(): HasMany
    {
        return $this->hasMany(SnagReminderLog::class);
    }

    public function inspectionRecurringSchedulesCreated(): HasMany
    {
        return $this->hasMany(InspectionRecurringSchedule::class, 'created_by');
    }

    public function inspectionRecurringSchedulesUpdated(): HasMany
    {
        return $this->hasMany(InspectionRecurringSchedule::class, 'updated_by');
    }

    public function inspectionRecurringSchedulesAssigned(): HasMany
    {
        return $this->hasMany(InspectionRecurringSchedule::class, 'assign_to_user_id');
    }

    public function projectRoleAssignments(): HasMany
    {
        return $this->hasMany(ProjectUserRole::class);
    }

    public function delegationsGiven(): HasMany
    {
        return $this->hasMany(DelegationRule::class, 'delegator_user_id');
    }

    public function delegationsReceived(): HasMany
    {
        return $this->hasMany(DelegationRule::class, 'delegate_user_id');
    }

    public function stakeholderCompanies(): BelongsToMany
    {
        return $this->belongsToMany(StakeholderCompany::class, 'company_user', 'user_id', 'company_id')
            ->withPivot(['organization_id', 'job_title', 'is_primary', 'is_active'])
            ->withTimestamps();
    }

    public function stakeholderTeams(): BelongsToMany
    {
        return $this->belongsToMany(StakeholderTeam::class, 'team_user', 'user_id', 'team_id')
            ->withPivot(['organization_id', 'is_lead', 'is_active'])
            ->withTimestamps();
    }

    public function organizationInvites(): HasMany
    {
        return $this->hasMany(OrganizationInvite::class, 'invited_by');
    }

    /**
     * @return array<int, string>
     */
    public function roleNamesForOrganization(int $organizationId): array
    {
        $previous = getPermissionsTeamId();
        setPermissionsTeamId($organizationId);

        $roles = $this->getRoleNames()->values()->all();

        setPermissionsTeamId($previous);

        return $roles;
    }

    /**
     * @return array<int, string>
     */
    public function roleNamesForProject(int $organizationId, int $projectId): array
    {
        return app(AccessControlService::class)->effectiveRoleNames($this, $organizationId, $projectId);
    }

    /**
     * @return array<int, string>
     */
    public function permissionNamesForProject(int $organizationId, ?int $projectId = null): array
    {
        return app(AccessControlService::class)->effectivePermissionNames($this, $organizationId, $projectId);
    }

    public function hasPermissionInProject(int $organizationId, ?int $projectId, string $permission): bool
    {
        return app(AccessControlService::class)->allows($this, $organizationId, $projectId, $permission);
    }

    public function hasPermissionInOrganization(int $organizationId, string $permission): bool
    {
        return $this->hasPermissionInProject($organizationId, null, $permission);
    }
}

