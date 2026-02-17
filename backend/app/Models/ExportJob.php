<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

class ExportJob extends Model
{
    /** @use HasFactory<\Database\Factories\ExportJobFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'requested_by',
        'project_id',
        'type',
        'status',
        'filters',
        'file_name',
        'file_path',
        'mime_type',
        'download_token',
        'error_message',
        'completed_at',
    ];

    protected $appends = [
        'download_url',
    ];

    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'completed_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function getDownloadUrlAttribute(): ?string
    {
        if ($this->status !== 'completed' || ! $this->file_path) {
            return null;
        }

        if (app()->isLocal()) {
            return Storage::disk('public')->url($this->file_path);
        }

        return URL::temporarySignedRoute('exports.download.signed', now()->addMinutes(15), [
            'exportJob' => $this->id,
        ]);
    }
}
