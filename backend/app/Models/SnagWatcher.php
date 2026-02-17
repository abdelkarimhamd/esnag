<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagWatcher extends Model
{
    /** @use HasFactory<\Database\Factories\SnagWatcherFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_id',
        'user_id',
        'source',
        'created_by',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
