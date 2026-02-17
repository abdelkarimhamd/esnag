<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class InspectionApproval extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionApprovalFactory> */
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'organization_id',
        'inspection_submission_id',
        'step_order',
        'step_name',
        'role_name',
        'requires_signature',
        'status',
        'approver_id',
        'decision_notes',
        'acted_at',
    ];

    protected function casts(): array
    {
        return [
            'step_order' => 'integer',
            'requires_signature' => 'boolean',
            'acted_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(InspectionSubmission::class, 'inspection_submission_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(InspectionSignature::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(InspectionApprovalMessage::class);
    }
}
