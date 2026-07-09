<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A first-class, attributable handover discussion comment (item 10 / BR-FR-031,
 * BR-BR-002), scoped to a request + stage + cycle + source party. Separate from
 * the immutable {@see HandoverEvent} audit trail. Mirrors {@see SnagComment}.
 */
class HandoverComment extends Model
{
    protected $fillable = [
        'handover_request_id',
        'organization_id',
        'user_id',
        'source_company_id',
        'parent_id',
        'stage_order',
        'cycle_number',
        'client_uuid',
        'body',
        'is_internal',
    ];

    protected function casts(): array
    {
        return [
            'stage_order' => 'integer',
            'cycle_number' => 'integer',
            'is_internal' => 'boolean',
        ];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(HandoverRequest::class, 'handover_request_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sourceCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'source_company_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('created_at');
    }
}
