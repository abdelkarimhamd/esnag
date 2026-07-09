<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A one-time passcode challenge (item 15). Channel-agnostic; the code is stored
 * hashed and the challenge is single-use with an expiry.
 */
class OtpChallenge extends Model
{
    protected $fillable = [
        'user_id',
        'channel',
        'code_hash',
        'destination',
        'attempts',
        'expires_at',
        'consumed_at',
    ];

    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    public function isConsumable(): bool
    {
        return $this->consumed_at === null && $this->expires_at->isFuture();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
