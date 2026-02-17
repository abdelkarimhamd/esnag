<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkflowAutomationLog extends Model
{
    /** @use HasFactory<\Database\Factories\WorkflowAutomationLogFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'workflow_automation_rule_id',
        'snag_id',
        'triggered_by',
        'trigger_event',
        'result',
        'message',
        'payload',
        'executed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'executed_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(WorkflowAutomationRule::class, 'workflow_automation_rule_id');
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}
