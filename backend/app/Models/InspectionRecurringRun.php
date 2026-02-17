<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InspectionRecurringRun extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionRecurringRunFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'inspection_recurring_schedule_id',
        'inspection_submission_id',
        'run_at',
        'status',
        'message',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'run_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(InspectionRecurringSchedule::class, 'inspection_recurring_schedule_id');
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(InspectionSubmission::class, 'inspection_submission_id');
    }
}
