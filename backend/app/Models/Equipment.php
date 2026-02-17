<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Equipment extends Model
{
    /** @use HasFactory<\Database\Factories\EquipmentFactory> */
    use HasFactory;

    protected $table = 'equipments';

    protected $fillable = [
        'organization_id',
        'project_id',
        'location_id',
        'code',
        'name',
        'category',
        'barcode',
        'serial_number',
        'manufacturer',
        'model',
        'status',
        'installed_at',
        'last_maintenance_at',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'installed_at' => 'date',
            'last_maintenance_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function maintenanceLogs(): HasMany
    {
        return $this->hasMany(EquipmentMaintenanceLog::class)->orderByDesc('occurred_at');
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class);
    }
}
