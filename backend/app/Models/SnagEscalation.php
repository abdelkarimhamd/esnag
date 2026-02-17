<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagEscalation extends Model
{
    /** @use HasFactory<\Database\Factories\SnagEscalationFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_id',
        'snag_escalation_rule_id',
        'escalated_to_user_id',
        'triggered_by',
        'escalated_at',
        'status_at_escalation',
        'reason',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'escalated_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(SnagEscalationRule::class, 'snag_escalation_rule_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'escalated_to_user_id');
    }

    public function triggerActor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}
