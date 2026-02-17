<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DrawingRevision extends Model
{
    /** @use HasFactory<\Database\Factories\DrawingRevisionFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'drawing_id',
        'revision_label',
        'file_name',
        'file_path',
        'mime_type',
        'file_size',
        'uploaded_by',
        'notes',
        'security_meta',
        'is_current',
    ];

    protected function casts(): array
    {
        return [
            'is_current' => 'boolean',
            'file_size' => 'integer',
            'security_meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function drawing(): BelongsTo
    {
        return $this->belongsTo(Drawing::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class);
    }

    public function outgoingMappings(): HasMany
    {
        return $this->hasMany(DrawingRevisionMapping::class, 'from_revision_id');
    }

    public function incomingMappings(): HasMany
    {
        return $this->hasMany(DrawingRevisionMapping::class, 'to_revision_id');
    }

    public function locationZones(): HasMany
    {
        return $this->hasMany(DrawingLocationZone::class);
    }
}

