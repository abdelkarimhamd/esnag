<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class InspectionRequest extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionRequestFactory> */
    use HasFactory;

    public const TYPE_MIR = 'mir';
    public const TYPE_WIR = 'wir';
    public const TYPE_IR = 'ir';

    public const STATUS_REQUESTED = 'requested';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'organization_id',
        'project_id',
        'snag_id',
        'handover_request_id',
        'inspection_submission_id',
        'reference',
        'request_type',
        'title',
        'description',
        'status',
        'requested_by',
        'assigned_to',
        'stakeholder_team_id',
        'scheduled_for',
        'completed_at',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_for' => 'datetime',
            'completed_at' => 'datetime',
            'metadata' => 'array',
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

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(InspectionSubmission::class, 'inspection_submission_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function handoverRequest(): BelongsTo
    {
        return $this->belongsTo(HandoverRequest::class, 'handover_request_id');
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(StakeholderTeam::class, 'stakeholder_team_id');
    }
}
