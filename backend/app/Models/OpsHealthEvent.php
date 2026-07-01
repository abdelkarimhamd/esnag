<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class OpsHealthEvent extends Model
{
    /** @use HasFactory<\Database\Factories\OpsHealthEventFactory> */
    use HasFactory;
    use MassPrunable;

    protected $fillable = [
        'organization_id',
        'event_type',
        'severity',
        'source',
        'message',
        'context',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'context' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /**
     * Bound table growth: ops telemetry (latency samples, storage/websocket
     * failures) is only ever queried within a rolling window (<= 7 days), so
     * anything older than the retention period is safe to delete. Pruned by the
     * scheduled `model:prune` command (see routes/console.php).
     */
    public function prunable(): Builder
    {
        return static::query()->where('occurred_at', '<', Carbon::now()->subDays(30));
    }
}

