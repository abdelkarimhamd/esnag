<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MobileSyncProcessedOperation extends Model
{
    /** @use HasFactory<\Database\Factories\MobileSyncProcessedOperationFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'op_id',
        'status',
        'result',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'result' => 'array',
            'processed_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
