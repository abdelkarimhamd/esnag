<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagAttachment extends Model
{
    /** @use HasFactory<\Database\Factories\SnagAttachmentFactory> */
    use HasFactory;

    protected $fillable = [
        'snag_id',
        'client_uuid',
        'organization_id',
        'uploaded_by',
        'type',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
        'markup_data',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'markup_data' => 'array',
            'metadata' => 'array',
        ];
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}

