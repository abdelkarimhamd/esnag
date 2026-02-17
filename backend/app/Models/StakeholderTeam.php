<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StakeholderTeam extends Model
{
    /** @use HasFactory<\Database\Factories\StakeholderTeamFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'company_id',
        'name',
        'code',
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

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'company_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'team_user', 'team_id', 'user_id')
            ->withPivot(['organization_id', 'is_lead', 'is_active'])
            ->withTimestamps();
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class, 'assigned_team_id');
    }
}
