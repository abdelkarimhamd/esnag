<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DrawingRevisionMapping extends Model
{
    /** @use HasFactory<\Database\Factories\DrawingRevisionMappingFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'drawing_id',
        'from_revision_id',
        'to_revision_id',
        'transform_type',
        'transform_params',
        'confidence_score',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'transform_params' => 'array',
            'confidence_score' => 'float',
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

    public function fromRevision(): BelongsTo
    {
        return $this->belongsTo(DrawingRevision::class, 'from_revision_id');
    }

    public function toRevision(): BelongsTo
    {
        return $this->belongsTo(DrawingRevision::class, 'to_revision_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{x: float, y: float, was_clamped: bool}
     */
    public static function applyTransform(string $type, array $params, float $x, float $y): array
    {
        [$nextX, $nextY] = match ($type) {
            'offset_scale' => self::applyOffsetScale($params, $x, $y),
            'affine' => self::applyAffine($params, $x, $y),
            default => [$x, $y],
        };

        $clampedX = min(1, max(0, $nextX));
        $clampedY = min(1, max(0, $nextY));

        return [
            'x' => round($clampedX, 6),
            'y' => round($clampedY, 6),
            'was_clamped' => abs($clampedX - $nextX) > 0.0000001 || abs($clampedY - $nextY) > 0.0000001,
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{0: float, 1: float}
     */
    private static function applyOffsetScale(array $params, float $x, float $y): array
    {
        $scaleX = is_numeric($params['scale_x'] ?? null) ? (float) $params['scale_x'] : 1.0;
        $scaleY = is_numeric($params['scale_y'] ?? null) ? (float) $params['scale_y'] : 1.0;
        $offsetX = is_numeric($params['offset_x'] ?? null) ? (float) $params['offset_x'] : 0.0;
        $offsetY = is_numeric($params['offset_y'] ?? null) ? (float) $params['offset_y'] : 0.0;

        return [
            ($x * $scaleX) + $offsetX,
            ($y * $scaleY) + $offsetY,
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{0: float, 1: float}
     */
    private static function applyAffine(array $params, float $x, float $y): array
    {
        $a = is_numeric($params['a'] ?? null) ? (float) $params['a'] : 1.0;
        $b = is_numeric($params['b'] ?? null) ? (float) $params['b'] : 0.0;
        $c = is_numeric($params['c'] ?? null) ? (float) $params['c'] : 0.0;
        $d = is_numeric($params['d'] ?? null) ? (float) $params['d'] : 0.0;
        $e = is_numeric($params['e'] ?? null) ? (float) $params['e'] : 1.0;
        $f = is_numeric($params['f'] ?? null) ? (float) $params['f'] : 0.0;

        return [
            ($a * $x) + ($b * $y) + $c,
            ($d * $x) + ($e * $y) + $f,
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{type: string, params: array<string, float>}|null
     */
    public static function invertTransform(string $type, array $params): ?array
    {
        if ($type === 'identity') {
            return [
                'type' => 'identity',
                'params' => [],
            ];
        }

        if ($type === 'offset_scale') {
            $scaleX = is_numeric($params['scale_x'] ?? null) ? (float) $params['scale_x'] : 1.0;
            $scaleY = is_numeric($params['scale_y'] ?? null) ? (float) $params['scale_y'] : 1.0;
            $offsetX = is_numeric($params['offset_x'] ?? null) ? (float) $params['offset_x'] : 0.0;
            $offsetY = is_numeric($params['offset_y'] ?? null) ? (float) $params['offset_y'] : 0.0;

            if (abs($scaleX) < 0.0000001 || abs($scaleY) < 0.0000001) {
                return null;
            }

            return [
                'type' => 'offset_scale',
                'params' => [
                    'scale_x' => 1 / $scaleX,
                    'scale_y' => 1 / $scaleY,
                    'offset_x' => -$offsetX / $scaleX,
                    'offset_y' => -$offsetY / $scaleY,
                ],
            ];
        }

        if ($type === 'affine') {
            $a = is_numeric($params['a'] ?? null) ? (float) $params['a'] : 1.0;
            $b = is_numeric($params['b'] ?? null) ? (float) $params['b'] : 0.0;
            $c = is_numeric($params['c'] ?? null) ? (float) $params['c'] : 0.0;
            $d = is_numeric($params['d'] ?? null) ? (float) $params['d'] : 0.0;
            $e = is_numeric($params['e'] ?? null) ? (float) $params['e'] : 1.0;
            $f = is_numeric($params['f'] ?? null) ? (float) $params['f'] : 0.0;

            $determinant = ($a * $e) - ($b * $d);
            if (abs($determinant) < 0.0000001) {
                return null;
            }

            return [
                'type' => 'affine',
                'params' => [
                    'a' => $e / $determinant,
                    'b' => -$b / $determinant,
                    'c' => (($b * $f) - ($c * $e)) / $determinant,
                    'd' => -$d / $determinant,
                    'e' => $a / $determinant,
                    'f' => (($c * $d) - ($a * $f)) / $determinant,
                ],
            ];
        }

        return null;
    }
}
