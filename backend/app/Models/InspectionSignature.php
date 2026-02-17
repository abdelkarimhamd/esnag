<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class InspectionSignature extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionSignatureFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'inspection_submission_id',
        'inspection_approval_id',
        'signed_by',
        'context',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
        'signed_at',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'signed_at' => 'datetime',
            'metadata' => 'array',
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

    public function signer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'signed_by');
    }
}
