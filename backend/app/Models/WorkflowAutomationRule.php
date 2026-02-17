<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkflowAutomationRule extends Model
{
    /** @use HasFactory<\Database\Factories\WorkflowAutomationRuleFactory> */
    use HasFactory;

    public const TRIGGER_SNAG_CREATED = 'snag_created';
    public const TRIGGER_SNAG_UPDATED = 'snag_updated';
    public const TRIGGER_SNAG_STATUS_CHANGED = 'snag_status_changed';

    protected $fillable = [
        'organization_id',
        'project_id',
        'name',
        'description',
        'trigger_event',
        'conditions',
        'actions',
        'priority',
        'run_once_per_snag',
        'is_active',
        'last_triggered_at',
        'trigger_count',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'actions' => 'array',
            'priority' => 'integer',
            'run_once_per_snag' => 'boolean',
            'is_active' => 'boolean',
            'last_triggered_at' => 'datetime',
            'trigger_count' => 'integer',
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(WorkflowAutomationLog::class);
    }
}
