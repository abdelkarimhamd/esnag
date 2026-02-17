<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

class MobileAuthDevice extends Model
{
    /** @use HasFactory<\Database\Factories\MobileAuthDeviceFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'device_id',
        'device_name',
        'platform',
        'app_version',
        'is_active',
        'trusted_until',
        'last_token_id',
        'last_ip',
        'last_user_agent',
        'last_seen_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'trusted_until' => 'datetime',
            'last_seen_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lastToken(): BelongsTo
    {
        return $this->belongsTo(PersonalAccessToken::class, 'last_token_id');
    }
}

