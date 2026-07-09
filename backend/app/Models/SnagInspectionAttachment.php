<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagInspectionAttachment extends Model
{
    protected $fillable = [
        'organization_id',
        'snag_inspection_id',
        'uploaded_by',
        'type',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
        ];
    }

    public function inspection(): BelongsTo
    {
        return $this->belongsTo(SnagInspection::class, 'snag_inspection_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
