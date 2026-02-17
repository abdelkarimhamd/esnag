<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationUsageLimit extends Model
{
    /** @use HasFactory<\Database\Factories\OrganizationUsageLimitFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'storage_quota_mb',
        'max_exports_per_day',
        'max_users',
        'meta',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'storage_quota_mb' => 'integer',
            'max_exports_per_day' => 'integer',
            'max_users' => 'integer',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

