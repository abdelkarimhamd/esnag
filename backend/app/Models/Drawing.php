<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RuntimeException;

class Drawing extends Model
{
    /** @use HasFactory<\Database\Factories\DrawingFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'area_id',
        'building_id',
        'floor_id',
        'title',
        'code',
        'description',
        'current_revision_id',
    ];

    /**
     * BR-BR-016: a building must always retain at least one drawing. Block the
     * deletion of a building's last drawing (drawings not tied to a building are
     * unaffected).
     */
    protected static function booted(): void
    {
        static::deleting(function (Drawing $drawing): void {
            if ($drawing->building_id === null) {
                return;
            }

            $siblings = static::query()
                ->where('building_id', $drawing->building_id)
                ->where('id', '!=', $drawing->id)
                ->count();

            if ($siblings === 0) {
                throw new RuntimeException('A building must retain at least one drawing (BR-BR-016).');
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function area(): BelongsTo
    {
        return $this->belongsTo(Area::class);
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

