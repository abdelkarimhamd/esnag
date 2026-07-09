<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * The single write path for the unified audit stream (item 9 / BR-BR-013).
 * Denormalizes the actor's effective role and party (company) at write time —
 * exactly like {@see HandoverRoutingService::recordEvent()} does for handover
 * events — so the trail stays accurate even if roles change later.
 */
class AuditRecorder
{
    public function __construct(private readonly AccessControlService $accessControlService)
    {
    }

    /**
     * @param  array<string, mixed>|null  $prior
     * @param  array<string, mixed>|null  $new
     * @param  array<string, mixed>  $metadata
     */
    public function record(
        int $organizationId,
        ?User $actor,
        string $action,
        ?Model $subject = null,
        ?int $projectId = null,
        ?array $prior = null,
        ?array $new = null,
        ?string $reason = null,
        array $metadata = [],
    ): AuditEvent {
        return AuditEvent::query()->create([
            'organization_id' => $organizationId,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'project_id' => $projectId,
            'actor_id' => $actor?->id,
            'actor_company_id' => $actor ? $this->resolveActorCompanyId($actor, $organizationId) : null,
            'actor_role' => $actor ? $this->resolveActorRole($actor, $organizationId, $projectId) : null,
            'action' => $action,
            'prior' => $prior,
            'new' => $new,
            'reason' => $reason,
            'metadata' => $metadata !== [] ? $metadata : null,
        ]);
    }

    private function resolveActorRole(User $actor, int $organizationId, ?int $projectId): ?string
    {
        $roles = $this->accessControlService->effectiveRoleNames($actor, $organizationId, $projectId);

        return $roles[0] ?? null;
    }

    private function resolveActorCompanyId(User $actor, int $organizationId): ?int
    {
        $companyId = DB::table('company_user')
            ->where('organization_id', $organizationId)
            ->where('user_id', $actor->id)
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->value('company_id');

        return $companyId ? (int) $companyId : null;
    }
}
