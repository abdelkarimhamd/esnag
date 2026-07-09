<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SnagInspection extends Model
{
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_id',
        'inspection_request_id',
        'reference',
        'status',
        'equipment_id',
        'asset_name',
        'maintenance_company_id',
        'maintenance_team_id',
        'maintenance_user_id',
        'notes',
        'inspected_by',
        'inspected_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'inspected_at' => 'datetime',
        ];
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function inspectionRequest(): BelongsTo
    {
        return $this->belongsTo(InspectionRequest::class);
    }

    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class);
    }

    public function maintenanceCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'maintenance_company_id');
    }

    public function maintenanceTeam(): BelongsTo
    {
        return $this->belongsTo(StakeholderTeam::class, 'maintenance_team_id');
    }

    public function maintenanceUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'maintenance_user_id');
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspected_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SnagInspectionAttachment::class);
    }
}
