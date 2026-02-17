<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CloseoutEvidence extends Model
{
    /** @use HasFactory<\Database\Factories\CloseoutEvidenceFactory> */
    use HasFactory;

    protected $table = 'closeout_evidences';

    protected $fillable = [
        'organization_id',
        'closeout_instance_item_id',
        'uploaded_by',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(CloseoutInstanceItem::class, 'closeout_instance_item_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
