<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagCommentAttachment extends Model
{
    /** @use HasFactory<\Database\Factories\SnagCommentAttachmentFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_comment_id',
        'uploaded_by',
        'type',
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

    public function comment(): BelongsTo
    {
        return $this->belongsTo(SnagComment::class, 'snag_comment_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
