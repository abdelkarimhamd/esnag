<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    /** @use HasFactory<\Database\Factories\NotificationPreferenceFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'user_id',
        'digest_frequency',
        'email_enabled',
        'in_app_enabled',
        'push_enabled',
        'immediate_assignment',
        'immediate_status_change',
        'immediate_comment',
        'immediate_mention',
        'immediate_escalation',
        'approval_needed',
        'signature_requested',
        'quiet_hours_start',
        'quiet_hours_end',
        'timezone',
        'last_daily_sent_at',
        'last_weekly_sent_at',
        'last_monthly_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'email_enabled' => 'boolean',
            'in_app_enabled' => 'boolean',
            'push_enabled' => 'boolean',
            'immediate_assignment' => 'boolean',
            'immediate_status_change' => 'boolean',
            'immediate_comment' => 'boolean',
            'immediate_mention' => 'boolean',
            'immediate_escalation' => 'boolean',
            'approval_needed' => 'boolean',
            'signature_requested' => 'boolean',
            'last_daily_sent_at' => 'datetime',
            'last_weekly_sent_at' => 'datetime',
            'last_monthly_sent_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
