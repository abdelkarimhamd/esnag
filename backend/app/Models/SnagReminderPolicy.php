<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SnagReminderPolicy extends Model
{
    /** @use HasFactory<\Database\Factories\SnagReminderPolicyFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'name',
        'statuses',
        'reminder_every_hours',
        'max_reminders',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'statuses' => 'array',
            'reminder_every_hours' => 'integer',
            'max_reminders' => 'integer',
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
        return $this->hasMany(SnagReminderLog::class);
    }
}
