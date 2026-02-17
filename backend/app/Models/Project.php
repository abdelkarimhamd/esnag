<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    /** @use HasFactory<\Database\Factories\ProjectFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'name',
        'code',
        'description',
        'status',
        'is_training',
        'training_locked',
        'training_notes',
        'start_date',
        'end_date',
    ];

    protected function casts(): array
    {
        return [
            'is_training' => 'boolean',
            'training_locked' => 'boolean',
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function buildings(): HasMany
    {
        return $this->hasMany(Building::class);
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

    public function stakeholderTeams(): HasMany
    {
        return $this->hasMany(StakeholderTeam::class);
    }

    public function projectUserRoles(): HasMany
    {
        return $this->hasMany(ProjectUserRole::class);
    }
}

