<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Drawing extends Model
{
    /** @use HasFactory<\Database\Factories\DrawingFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'building_id',
        'floor_id',
        'title',
        'code',
        'description',
        'current_revision_id',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function building(): BelongsTo
    {
        return $this->belongsTo(Building::class);
    }

    public function floor(): BelongsTo
    {
        return $this->belongsTo(Floor::class);
    }

    public function currentRevision(): BelongsTo
    {
        return $this->belongsTo(DrawingRevision::class, 'current_revision_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(DrawingRevision::class)->orderByDesc('created_at');
    }

    public function snags(): HasMany
    {
        return $this->hasMany(Snag::class);
    }

    public function revisionMappings(): HasMany
    {
        return $this->hasMany(DrawingRevisionMapping::class);
    }

    public function locationZones(): HasMany
    {
        return $this->hasMany(DrawingLocationZone::class)->orderByDesc('priority');
    }
}

