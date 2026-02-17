<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RootCauseCategory extends Model
{
    /** @use HasFactory<\Database\Factories\RootCauseCategoryFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'name',
        'code',
        'description',
        'is_active',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class);
    }
}

