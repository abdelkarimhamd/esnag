<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnboardingTourProgress extends Model
{
    /** @use HasFactory<\Database\Factories\OnboardingTourProgressFactory> */
    use HasFactory;

    protected $table = 'onboarding_tour_progresses';

    protected $fillable = [
        'organization_id',
        'user_id',
        'tour_key',
        'current_step',
        'last_viewed_at',
        'completed_at',
        'skipped_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'current_step' => 'integer',
            'last_viewed_at' => 'datetime',
            'completed_at' => 'datetime',
            'skipped_at' => 'datetime',
            'meta' => 'array',
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

