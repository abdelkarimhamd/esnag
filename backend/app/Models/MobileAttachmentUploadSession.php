<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MobileAttachmentUploadSession extends Model
{
    /** @use HasFactory<\Database\Factories\MobileAttachmentUploadSessionFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'user_id',
        'snag_id',
        'upload_uuid',
        'file_name',
        'mime_type',
        'total_chunks',
        'received_chunks',
        'file_size',
        'pii_redacted',
        'status',
        'temp_dir',
        'assembled_path',
        'security_meta',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'total_chunks' => 'integer',
            'received_chunks' => 'array',
            'file_size' => 'integer',
            'pii_redacted' => 'boolean',
            'security_meta' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }
}
