<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MobileSyncOperationLog extends Model
{
    /** @use HasFactory<\Database\Factories\MobileSyncOperationLogFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'user_id',
        'op_id',
        'operation_type',
        'status',
        'source',
        'error_code',
        'error_message',
        'payload',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'occurred_at' => 'datetime',
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

