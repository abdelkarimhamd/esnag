<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Organization extends Model
{
    /** @use HasFactory<\Database\Factories\OrganizationFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'description',
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot(['employee_code', 'job_title', 'is_active', 'joined_at'])
            ->withTimestamps();
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function drawings(): HasMany
    {
        return $this->hasMany(Drawing::class);
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class);
    }

    public function closeoutTemplates(): HasMany
    {
        return $this->hasMany(CloseoutTemplate::class);
    }

    public function closeoutInstances(): HasMany
    {
        return $this->hasMany(CloseoutInstance::class);
    }

    public function exportJobs(): HasMany
    {
        return $this->hasMany(ExportJob::class);
    }

    public function inspectionTemplates(): HasMany
    {
        return $this->hasMany(InspectionTemplate::class);
    }

    public function inspectionSubmissions(): HasMany
    {
        return $this->hasMany(InspectionSubmission::class);
    }

    public function inspectionApprovals(): HasMany
    {
        return $this->hasMany(InspectionApproval::class);
    }

    public function inspectionSignatures(): HasMany
    {
        return $this->hasMany(InspectionSignature::class);
    }

    public function inspectionRequests(): HasMany
    {
        return $this->hasMany(InspectionRequest::class);
    }

    public function equipments(): HasMany
    {
        return $this->hasMany(Equipment::class);
    }

    public function equipmentMaintenanceLogs(): HasMany
    {
        return $this->hasMany(EquipmentMaintenanceLog::class);
    }

    public function stakeholderCompanies(): HasMany
    {
        return $this->hasMany(StakeholderCompany::class);
    }

    public function stakeholderTeams(): HasMany
    {
        return $this->hasMany(StakeholderTeam::class);
    }

    public function rootCauseCategories(): HasMany
    {
        return $this->hasMany(RootCauseCategory::class);
    }

    public function dashboardConfigs(): HasMany
    {
        return $this->hasMany(DashboardConfig::class);
    }

    public function projectUserRoles(): HasMany
    {
        return $this->hasMany(ProjectUserRole::class);
    }

    public function delegationRules(): HasMany
    {
        return $this->hasMany(DelegationRule::class);
    }

    public function permissionPresets(): HasMany
    {
        return $this->hasMany(PermissionPreset::class);
    }

    public function notificationPreferences(): HasMany
    {
        return $this->hasMany(NotificationPreference::class);
    }

    public function mobileDeviceTokens(): HasMany
    {
        return $this->hasMany(MobileDeviceToken::class);
    }

    public function snagWatchers(): HasMany
    {
        return $this->hasMany(SnagWatcher::class);
    }

    public function snagCommentMentions(): HasMany
    {
        return $this->hasMany(SnagCommentMention::class);
    }

    public function snagCommentAttachments(): HasMany
    {
        return $this->hasMany(SnagCommentAttachment::class);
    }

    public function inspectionApprovalMessages(): HasMany
    {
        return $this->hasMany(InspectionApprovalMessage::class);
    }

    public function snagEscalationRules(): HasMany
    {
        return $this->hasMany(SnagEscalationRule::class);
    }

    public function snagEscalations(): HasMany
    {
        return $this->hasMany(SnagEscalation::class);
    }

    public function featureFlags(): HasMany
    {
        return $this->hasMany(OrganizationFeatureFlag::class);
    }

    public function usageLimits(): HasMany
    {
        return $this->hasMany(OrganizationUsageLimit::class);
    }

    public function invites(): HasMany
    {
        return $this->hasMany(OrganizationInvite::class);
    }

    public function mobileSyncOperationLogs(): HasMany
    {
        return $this->hasMany(MobileSyncOperationLog::class);
    }

    public function opsHealthEvents(): HasMany
    {
        return $this->hasMany(OpsHealthEvent::class);
    }

    public function securitySetting(): HasOne
    {
        return $this->hasOne(OrganizationSecuritySetting::class);
    }
}

