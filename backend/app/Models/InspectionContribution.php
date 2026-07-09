<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single attributed contribution to an inspection submission (item 8 /
 * BR-BR-002, BR-BR-017): who authored which observation field or photo, on
 * behalf of which party, and when. Append-only log (created_at only).
 */
class InspectionContribution extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'organization_id',
        'inspection_submission_id',
        'user_id',
        'stakeholder_company_id',
        'field_key',
        'contribution_type',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(InspectionSubmission::class, 'inspection_submission_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'stakeholder_company_id');
    }
}
