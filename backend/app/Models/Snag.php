<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Snag extends Model
{
    /** @use HasFactory<\Database\Factories\SnagFactory> */
    use HasFactory;

    public const PRIORITIES = ['low', 'medium', 'high', 'critical'];

    protected $fillable = [
        'organization_id',
        'project_id',
        'drawing_id',
        'drawing_revision_id',
        'building_id',
        'floor_id',
        'location_id',
        'root_cause_category_id',
        'equipment_id',
        'reference',
        'client_uuid',
        'title',
        'description',
        'priority',
        'trade',
        'status',
        'pin_x',
        'pin_y',
        'created_by',
        'assigned_to',
        'assigned_company_id',
        'assigned_team_id',
        'dispatched_to',
        'dispatch_note',
        'dispatched_at',
        'due_date',
        'estimated_cost',
        'estimated_hours',
        'acknowledged_at',
        'started_at',
        'ready_for_review_at',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'pin_x' => 'float',
            'pin_y' => 'float',
            'dispatched_at' => 'datetime',
            'due_date' => 'date',
            'estimated_cost' => 'decimal:2',
            'estimated_hours' => 'decimal:2',
            'acknowledged_at' => 'datetime',
            'started_at' => 'datetime',
            'ready_for_review_at' => 'datetime',
            'closed_at' => 'datetime',
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

    public function drawing(): BelongsTo
    {
        return $this->belongsTo(Drawing::class);
    }

    public function drawingRevision(): BelongsTo
    {
        return $this->belongsTo(DrawingRevision::class);
    }

    public function building(): BelongsTo
    {
        return $this->belongsTo(Building::class);
    }

    public function floor(): BelongsTo
    {
        return $this->belongsTo(Floor::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function rootCauseCategory(): BelongsTo
    {
        return $this->belongsTo(RootCauseCategory::class);
    }

    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function assignedCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'assigned_company_id');
    }

    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(StakeholderTeam::class, 'assigned_team_id');
    }

    public function dispatchRecipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_to');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SnagAttachment::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(SnagComment::class)->orderByDesc('created_at');
    }

    public function rootComments(): HasMany
    {
        return $this->hasMany(SnagComment::class)
            ->whereNull('parent_id')
            ->orderByDesc('created_at');
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(SnagStatusHistory::class)->orderByDesc('created_at');
    }

    public function closeoutInstance(): HasOne
    {
        return $this->hasOne(CloseoutInstance::class);
    }

    public function equipmentMaintenanceLogs(): HasMany
    {
        return $this->hasMany(EquipmentMaintenanceLog::class);
    }

    public function watchers(): HasMany
    {
        return $this->hasMany(SnagWatcher::class);
    }

    public function watcherUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'snag_watchers', 'snag_id', 'user_id')
            ->withPivot(['organization_id', 'source', 'created_by'])
            ->withTimestamps();
    }

    public function escalations(): HasMany
    {
        return $this->hasMany(SnagEscalation::class);
    }

    public function automationLogs(): HasMany
    {
        return $this->hasMany(WorkflowAutomationLog::class);
    }

    public function reminderLogs(): HasMany
    {
        return $this->hasMany(SnagReminderLog::class);
    }
}

