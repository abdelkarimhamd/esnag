<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InspectionRecurringSchedule extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionRecurringScheduleFactory> */
    use HasFactory;

    public const RECURRENCE_DAILY = 'daily';
    public const RECURRENCE_WEEKLY = 'weekly';
    public const RECURRENCE_BIWEEKLY = 'biweekly';
    public const RECURRENCE_MONTHLY = 'monthly';

    protected $fillable = [
        'organization_id',
        'project_id',
        'inspection_template_id',
        'name',
        'recurrence',
        'interval_value',
        'starts_at',
        'ends_at',
        'next_run_at',
        'run_time',
        'timezone',
        'default_form_data',
        'assign_to_user_id',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'interval_value' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'next_run_at' => 'datetime',
            'default_form_data' => 'array',
            'is_active' => 'boolean',
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

    public function template(): BelongsTo
    {
        return $this->belongsTo(InspectionTemplate::class, 'inspection_template_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assign_to_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(InspectionRecurringRun::class);
    }
}
