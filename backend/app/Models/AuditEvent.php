<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RuntimeException;

/**
 * Unified, polymorphic, append-only audit event (item 9 / BR-BR-013, §11.3).
 * Write-once: no updated_at, and the model rejects any update or delete so the
 * trail is tamper-evident even without DB triggers — same guarantee as
 * {@see HandoverEvent}, which remains the handover-specific stream.
 */
class AuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'organization_id',
        'subject_type',
        'subject_id',
        'project_id',
        'actor_id',
        'actor_company_id',
        'actor_role',
        'action',
        'prior',
        'new',
        'reason',
        'metadata',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'prior' => 'array',
            'new' => 'array',
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (AuditEvent $event): void {
            throw new RuntimeException('audit_events are append-only and cannot be updated.');
        });

        static::deleting(function (AuditEvent $event): void {
            throw new RuntimeException('audit_events are append-only and cannot be deleted.');
        });
    }

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function actorCompany(): BelongsTo
    {
        return $this->belongsTo(StakeholderCompany::class, 'actor_company_id');
    }
}
