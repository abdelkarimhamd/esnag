<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InspectionApprovalMessage extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionApprovalMessageFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'inspection_submission_id',
        'inspection_approval_id',
        'user_id',
        'message_type',
        'body',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
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

    public function approval(): BelongsTo
    {
        return $this->belongsTo(InspectionApproval::class, 'inspection_approval_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
