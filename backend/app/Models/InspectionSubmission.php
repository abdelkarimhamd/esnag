<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class InspectionSubmission extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionSubmissionFactory> */
    use HasFactory;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SUBMITTED = 'submitted';
    public const STATUS_IN_REVIEW = 'in_review';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'organization_id',
        'project_id',
        'inspection_template_id',
        'reference',
        'status',
        'form_data',
        'current_approval_order',
        'created_by',
        'submitted_by',
        'submitted_at',
        'approved_at',
        'rejected_at',
        'last_updated_by',
    ];

    protected function casts(): array
    {
        return [
            'form_data' => 'array',
            'current_approval_order' => 'integer',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
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

    public function template(): BelongsTo
    {
        return $this->belongsTo(InspectionTemplate::class, 'inspection_template_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function lastUpdatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_updated_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(InspectionApproval::class)->orderBy('step_order');
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(InspectionSignature::class)->orderByDesc('signed_at');
    }

    public function requests(): HasMany
    {
        return $this->hasMany(InspectionRequest::class);
    }

    public function approvalMessages(): HasMany
    {
        return $this->hasMany(InspectionApprovalMessage::class)->orderBy('created_at');
    }
}
