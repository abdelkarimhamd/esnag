<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardConfig extends Model
{
    /** @use HasFactory<\Database\Factories\DashboardConfigFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'user_id',
        'name',
        'is_default',
        'cards',
        'filters',
        'layout',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'cards' => 'array',
            'filters' => 'array',
            'layout' => 'array',
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

