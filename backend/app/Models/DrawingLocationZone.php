<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DrawingLocationZone extends Model
{
    /** @use HasFactory<\Database\Factories\DrawingLocationZoneFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'drawing_id',
        'drawing_revision_id',
        'location_id',
        'zone_label',
        'x_min',
        'y_min',
        'x_max',
        'y_max',
        'priority',
        'metadata',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'x_min' => 'float',
            'y_min' => 'float',
            'x_max' => 'float',
            'y_max' => 'float',
            'priority' => 'integer',
            'metadata' => 'array',
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

    public function drawingRevision(): BelongsTo
    {
        return $this->belongsTo(DrawingRevision::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function containsPoint(float $x, float $y): bool
    {
        return $x >= $this->x_min
            && $x <= $this->x_max
            && $y >= $this->y_min
            && $y <= $this->y_max;
    }

    public function distanceToPoint(float $x, float $y): float
    {
        $dx = max($this->x_min - $x, 0.0, $x - $this->x_max);
        $dy = max($this->y_min - $y, 0.0, $y - $this->y_max);

        return sqrt(($dx * $dx) + ($dy * $dy));
    }
}
