<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SnagEscalationRule extends Model
{
    /** @use HasFactory<\Database\Factories\SnagEscalationRuleFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'name',
        'overdue_days',
        'escalate_to_roles',
        'cooldown_hours',
        'is_active',
        'last_evaluated_at',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'overdue_days' => 'integer',
            'escalate_to_roles' => 'array',
            'cooldown_hours' => 'integer',
            'is_active' => 'boolean',
            'last_evaluated_at' => 'datetime',
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

    public function escalations(): HasMany
    {
        return $this->hasMany(SnagEscalation::class, 'snag_escalation_rule_id');
    }
}
