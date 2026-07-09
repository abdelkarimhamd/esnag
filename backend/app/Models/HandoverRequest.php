<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RuntimeException;

class HandoverRequest extends Model
{
    /** @use HasFactory<\Database\Factories\HandoverRequestFactory> */
    use HasFactory;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_RETURNED = 'returned';
    public const STATUS_REVISING = 'revising';
    public const STATUS_CONSOLIDATING = 'consolidating';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_CLOSED = 'closed';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_CANCELLED = 'cancelled';

    /** Statuses on which a stage action may still be taken. */
    public const TRANSACTIONAL_STATUSES = [
        self::STATUS_DRAFT, self::STATUS_IN_PROGRESS, self::STATUS_RETURNED,
        self::STATUS_REVISING, self::STATUS_CONSOLIDATING, self::STATUS_APPROVED,
    ];

    public const TERMINAL_STATUSES = [self::STATUS_CLOSED, self::STATUS_REJECTED, self::STATUS_CANCELLED];

    /**
     * BR-BR-014: once a request leaves draft it is a submitted transaction and can
     * never be deleted — only cancelled through the routing service. Only a draft
     * (never submitted) may be discarded via deletion.
     */
    protected static function booted(): void
    {
        static::deleting(function (HandoverRequest $request): void {
            if ($request->status !== self::STATUS_DRAFT) {
                throw new RuntimeException('A submitted handover request cannot be deleted; cancel it instead (BR-BR-014).');
            }
        });
    }

    protected $fillable = [
        'organization_id',
        'project_id',
        'reference',
        'title',
        'description',
        'area_id',
        'building_id',
        'floor_id',
        'location_id',
        'location_text',
        'workflow_id',
        'workflow_version',
        'stage_graph_snapshot',
        'current_stage_order',
        'responsible_company_id',
        'assignee_id',
        'status',
        'cycle_number',
        'submitted_by',
        'submitted_by_company_id',
        'submitted_at',
        'closed_by',
        'closed_at',
        'stage_due_at',
        'last_escalated_at',
    ];

    protected function casts(): array
    {
        return [
            'stage_graph_snapshot' => 'array',
            'current_stage_order' => 'integer',
            'workflow_version' => 'integer',
            'cycle_number' => 'integer',
            'submitted_at' => 'datetime',
            'closed_at' => 'datetime',
            'stage_due_at' => 'datetime',
            'last_escalated_at' => 'datetime',
        ];
    }

    /**
     * The frozen snapshot node for the current stage pointer, or null if closed.
     *
     * @return array<string, mixed>|null
     */
    public function currentStageNode(): ?array
    {
        if ($this->current_stage_order === null) {
            return null;
        }

        return $this->stageNode((int) $this->current_stage_order);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function stageNode(int $stageOrder): ?array
    {
        foreach (($this->stage_graph_snapshot ?? []) as $node) {
            if ((int) ($node['stage_order'] ?? 0) === $stageOrder) {
                return $node;
            }
        }

        return null;
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(HandoverWorkflow::class, 'workflow_id');
    }

    public function responsibleCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'responsible_company_id');
    }

    public function submittedByCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'submitted_by_company_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function area(): BelongsTo
    {
        return $this->belongsTo(Area::class);
    }

    public function building(): BelongsTo
    {
        return $this->belongsTo(Building::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(HandoverEvent::class)->orderBy('created_at');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(HandoverRequestAttachment::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(HandoverComment::class);
    }

    public function snags(): BelongsToMany
    {
        return $this->belongsToMany(Snag::class, 'handover_request_snags')
            ->withPivot(['organization_id', 'is_mandatory', 'attached_by'])
            ->withTimestamps();
    }

    public function inspectionSubmissions(): BelongsToMany
    {
        return $this->belongsToMany(InspectionSubmission::class, 'handover_request_inspection_submissions')
            ->withPivot(['organization_id', 'attached_by'])
            ->withTimestamps();
    }
}
