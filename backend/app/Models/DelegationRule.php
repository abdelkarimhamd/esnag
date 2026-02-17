<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class DelegationRule extends Model
{
    /** @use HasFactory<\Database\Factories\DelegationRuleFactory> */
    use HasFactory;

    public const SCOPE_ALL = 'all';
    public const SCOPE_ASSIGNMENTS = 'assignments';
    public const SCOPE_APPROVALS = 'approvals';

    protected $fillable = [
        'organization_id',
        'project_id',
        'delegator_user_id',
        'delegate_user_id',
        'scope',
        'starts_at',
        'ends_at',
        'is_active',
        'reason',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'is_active' => 'boolean',
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

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_user_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isActiveAt(?Carbon $at = null): bool
    {
        $time = $at ?? now();

        return $this->is_active
            && $this->starts_at !== null
            && $this->ends_at !== null
            && $time->betweenIncluded($this->starts_at, $this->ends_at);
    }
}
