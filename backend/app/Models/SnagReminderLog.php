<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagReminderLog extends Model
{
    /** @use HasFactory<\Database\Factories\SnagReminderLogFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_id',
        'snag_reminder_policy_id',
        'user_id',
        'reminder_count',
        'reminded_at',
        'next_due_at',
    ];

    protected function casts(): array
    {
        return [
            'reminder_count' => 'integer',
            'reminded_at' => 'datetime',
            'next_due_at' => 'datetime',
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

    public function policy(): BelongsTo
    {
        return $this->belongsTo(SnagReminderPolicy::class, 'snag_reminder_policy_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
