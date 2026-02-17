<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\DelegationRule;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use App\Models\ProjectUserRole;
use App\Models\Snag;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use Database\Seeders\PermissionPresetSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class AdvancedRbacControlsTest extends TestCase
{
    use RefreshDatabase;

    public function test_project_role_override_allows_project_a_actions_but_blocks_project_b(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $scopedUser = User::factory()->create();
        $assignee = User::factory()->create();

        $organization->users()->attach($manager->id, ['is_active' => true]);
        $organization->users()->attach($scopedUser->id, ['is_active' => true]);
        $organization->users()->attach($assignee->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');
        $scopedUser->assignRole('viewer');
        $assignee->assignRole('engineer');

        $projectA = Project::factory()->create(['organization_id' => $organization->id]);
        $projectB = Project::factory()->create(['organization_id' => $organization->id]);

        ProjectUserRole::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $projectA->id,
            'user_id' => $scopedUser->id,
            'role_name' => 'contractor',
            'source' => 'test',
        ]);

        $snagA = $this->createSnagForProject($organization, $projectA, $manager);
        $snagB = $this->createSnagForProject($organization, $projectB, $manager);

        Sanctum::actingAs($scopedUser);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->putJson("/api/snags/{$snagA->id}", [
                'assigned_to' => $assignee->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $assignee->id);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->putJson("/api/snags/{$snagB->id}", [
                'assigned_to' => $assignee->id,
            ])
            ->assertStatus(403);
    }

    public function test_assignment_delegation_allows_dispatch_for_delegate_user(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $delegate = User::factory()->create();
        $assignee = User::factory()->create();

        $organization->users()->attach($manager->id, ['is_active' => true]);
        $organization->users()->attach($delegate->id, ['is_active' => true]);
        $organization->users()->attach($assignee->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');
        $delegate->assignRole('viewer');
        $assignee->assignRole('engineer');

        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $snag = $this->createSnagForProject($organization, $project, $manager, SnagStatus::Assigned->value);

        $company = StakeholderCompany::query()->create([
            'organization_id' => $organization->id,
            'name' => 'Contractor Team Co',
            'type' => 'contractor',
            'is_active' => true,
        ]);
        $company->users()->attach($assignee->id, [
            'organization_id' => $organization->id,
            'is_active' => true,
            'is_primary' => true,
        ]);

        $team = StakeholderTeam::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'company_id' => $company->id,
            'name' => 'Execution Team',
            'is_active' => true,
        ]);
        $team->users()->attach($assignee->id, [
            'organization_id' => $organization->id,
            'is_active' => true,
            'is_lead' => true,
        ]);

        $snag->update([
            'assigned_company_id' => $company->id,
            'assigned_team_id' => $team->id,
            'assigned_to' => null,
            'dispatched_to' => null,
        ]);

        DelegationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'delegator_user_id' => $manager->id,
            'delegate_user_id' => $delegate->id,
            'scope' => DelegationRule::SCOPE_ASSIGNMENTS,
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDays(5),
            'is_active' => true,
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($delegate);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/dispatch", [
                'assigned_to' => $assignee->id,
                'note' => 'Delegated dispatch while PM is absent',
            ])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $assignee->id)
            ->assertJsonPath('data.dispatched_to', $assignee->id);
    }

    public function test_permission_diff_endpoint_returns_missing_and_extra_permissions(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);
        (new PermissionPresetSeeder())->run();

        $admin = User::factory()->create();
        $viewer = User::factory()->create();
        $organization->users()->attach($admin->id, ['is_active' => true]);
        $organization->users()->attach($viewer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $admin->assignRole('org_admin');
        $viewer->assignRole('viewer');

        $project = Project::factory()->create(['organization_id' => $organization->id]);

        Sanctum::actingAs($admin);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/rbac/permission-diff?'.http_build_query([
                'preset_key' => 'owner',
                'project_id' => $project->id,
                'user_id' => $viewer->id,
            ]))
            ->assertOk();

        $this->assertGreaterThan(0, (int) $response->json('data.stats.missing_count'));
        $this->assertSame('owner', $response->json('data.preset.preset_key'));
    }

    private function createSnagForProject(Organization $organization, Project $project, User $creator, string $status = SnagStatus::New->value): Snag
    {
        $building = Building::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
        ]);

        $floor = Floor::factory()->create([
            'organization_id' => $organization->id,
            'building_id' => $building->id,
        ]);

        $drawing = Drawing::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
        ]);

        return Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'status' => $status,
            'created_by' => $creator->id,
            'assigned_to' => null,
        ]);
    }
}
