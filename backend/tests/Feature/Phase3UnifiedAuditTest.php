<?php

namespace Tests\Feature;

use App\Models\Area;
use App\Models\AuditEvent;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * Phase 3 (item 9 / BR-BR-013) — the unified, polymorphic, append-only audit
 * stream: snag reassignment, master-data mutation, RBAC change, the read API,
 * and immutability.
 */
class Phase3UnifiedAuditTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: Organization, 1: User, 2: Project}
     */
    private function bootstrap(string $role = 'owner'): array
    {
        $organization = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $user->assignRole($role);

        $project = Project::factory()->create(['organization_id' => $organization->id]);

        return [$organization, $user, $project];
    }

    private function addMember(Organization $organization, string $role): User
    {
        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $user->assignRole($role);

        return $user;
    }

    public function test_snag_reassignment_writes_a_unified_audit_event_with_role(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');
        $memberA = User::factory()->create();
        $memberB = User::factory()->create();
        $organization->users()->attach($memberA->id, ['is_active' => true]);
        $organization->users()->attach($memberB->id, ['is_active' => true]);

        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
            'assigned_to' => $memberA->id,
            'status' => 'assigned',
        ]);

        Sanctum::actingAs($owner);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->putJson("/api/snags/{$snag->id}", [
                'assigned_to' => $memberB->id,
                'assignment_reason' => 'Shift change',
            ])->assertOk();

        $event = AuditEvent::query()->where('action', 'snag.reassigned')->firstOrFail();
        $this->assertSame($organization->id, $event->organization_id);
        $this->assertSame($owner->id, $event->actor_id);
        $this->assertSame('owner', $event->actor_role);
        $this->assertSame(Snag::class, $event->subject_type);
        $this->assertSame($snag->id, $event->subject_id);
        $this->assertSame($memberA->id, $event->prior['assigned_to']);
        $this->assertSame($memberB->id, $event->new['assigned_to']);
        $this->assertSame('Shift change', $event->reason);
    }

    public function test_master_data_mutation_is_audited(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');
        Sanctum::actingAs($owner);

        $area = $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/areas', [
                'project_id' => $project->id,
                'name' => 'West Zone',
                'code' => 'AREA-W',
            ])->assertCreated()->json('data');

        $this->assertDatabaseHas('audit_events', [
            'organization_id' => $organization->id,
            'action' => 'area.created',
            'subject_type' => Area::class,
            'subject_id' => $area['id'],
            'actor_id' => $owner->id,
        ]);
    }

    public function test_project_role_change_is_audited(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');
        $member = User::factory()->create();
        $organization->users()->attach($member->id, ['is_active' => true]);

        Sanctum::actingAs($owner);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->putJson("/api/projects/{$project->id}/roles/{$member->id}", [
                'roles' => ['engineer'],
            ])->assertOk();

        $event = AuditEvent::query()->where('action', 'rbac.project_roles_updated')->firstOrFail();
        $this->assertSame($owner->id, $event->actor_id);
        $this->assertSame(['roles' => []], $event->prior);
        $this->assertSame(['roles' => ['engineer']], $event->new);
        $this->assertSame($member->id, $event->subject_id);
    }

    public function test_audit_read_api_is_gated_and_filterable(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');

        Sanctum::actingAs($owner);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/areas', ['project_id' => $project->id, 'name' => 'Zone A'])
            ->assertCreated();

        // A read-only auditor may read the trail.
        $auditor = $this->addMember($organization, 'auditor');
        Sanctum::actingAs($auditor);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->getJson('/api/audit/events?action_prefix=area.')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'area.created')
            ->assertJsonPath('data.0.actor.id', $owner->id);
    }

    public function test_audit_read_api_denies_users_without_permission(): void
    {
        [$organization] = $this->bootstrap('owner');
        $engineer = $this->addMember($organization, 'engineer');
        Sanctum::actingAs($engineer);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->getJson('/api/audit/events')
            ->assertForbidden();
    }

    public function test_audit_trail_exports_as_csv(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');

        Sanctum::actingAs($owner);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/areas', ['project_id' => $project->id, 'name' => 'Export Zone'])
            ->assertCreated();

        // A read-only auditor holds audit.export.
        $auditor = $this->addMember($organization, 'auditor');
        Sanctum::actingAs($auditor);
        $response = $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->get('/api/audit/events/export');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('content-type'));
        $csv = $response->streamedContent();
        $this->assertStringContainsString('Action,Actor,Role,Party,Subject', $csv);
        $this->assertStringContainsString('area.created', $csv);

        // An engineer without audit.export is denied.
        $engineer = $this->addMember($organization, 'engineer');
        Sanctum::actingAs($engineer);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->get('/api/audit/events/export')
            ->assertForbidden();
    }

    public function test_audit_events_are_immutable(): void
    {
        [$organization, $owner, $project] = $this->bootstrap('owner');
        Sanctum::actingAs($owner);
        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/areas', ['project_id' => $project->id, 'name' => 'Zone Z'])
            ->assertCreated();

        $event = AuditEvent::query()->firstOrFail();

        try {
            $event->update(['action' => 'tampered']);
            $this->fail('Audit events must be immutable.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('append-only', $exception->getMessage());
        }
    }
}
