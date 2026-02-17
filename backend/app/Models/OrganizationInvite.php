<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationInvite extends Model
{
    /** @use HasFactory<\Database\Factories\OrganizationInviteFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'email',
        'token',
        'status',
        'invited_by',
        'invited_at',
        'last_sent_at',
        'send_count',
        'expires_at',
        'accepted_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'invited_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'send_count' => 'integer',
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }
}

