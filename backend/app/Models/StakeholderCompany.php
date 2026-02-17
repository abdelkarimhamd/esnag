<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StakeholderCompany extends Model
{
    /** @use HasFactory<\Database\Factories\StakeholderCompanyFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'name',
        'code',
        'type',
        'is_active',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function teams(): HasMany
    {
        return $this->hasMany(StakeholderTeam::class, 'company_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_user', 'company_id', 'user_id')
            ->withPivot(['organization_id', 'job_title', 'is_primary', 'is_active'])
            ->withTimestamps();
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class, 'assigned_company_id');
    }
}
