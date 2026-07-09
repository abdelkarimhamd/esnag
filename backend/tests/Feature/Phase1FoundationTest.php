<?php

namespace Tests\Feature;

use App\Models\Area;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use App\Models\SnagAttachment;
use App\Models\SnagCategory;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * Phase 1 (BRD gap) — Workstreams A (Area/location) and B (snag model rework).
 */
class Phase1FoundationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: Organization, 1: User, 2: Project}
     */
    private function bootstrapOrganization(string $role = 'owner'): array
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

    public function test_admin_can_build_the_area_building_floor_location_hierarchy(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');
        Sanctum::actingAs($owner);
        $headers = ['X-Organization-Id' => (string) $organization->id];

        $area = $this->withHeaders($headers)->postJson('/api/areas', [
            'project_id' => $project->id,
            'name' => 'North Precinct',
            'code' => 'AREA-N',
        ])->assertCreated()->json('data');

        $building = $this->withHeaders($headers)->postJson('/api/buildings', [
            'project_id' => $project->id,
            'area_id' => $area['id'],
            'name' => 'Villa 12',
            'code' => 'BLD-12',
        ])->assertCreated()->json('data');

        $this->assertSame($area['id'], $building['area_id']);

        $floor = $this->withHeaders($headers)->postJson('/api/floors', [
            'building_id' => $building['id'],
            'name' => 'Ground Floor',
            'level' => 0,
        ])->assertCreated()->json('data');

        $this->withHeaders($headers)->postJson('/api/locations', [
            'floor_id' => $floor['id'],
            'name' => 'Master Bedroom',
            'code' => 'MB-01',
        ])->assertCreated();

        $this->assertDatabaseHas('areas', ['id' => $area['id'], 'organization_id' => $organization->id]);
        $this->assertDatabaseHas('buildings', ['id' => $building['id'], 'area_id' => $area['id']]);

        // Area listing is scoped to the organization/project.
        $this->withHeaders($headers)->getJson('/api/areas?project_id='.$project->id)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_non_manager_cannot_create_snag_category(): void
    {
        [$organization, $engineer] = $this->bootstrapOrganization('engineer');
        Sanctum::actingAs($engineer);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snag-categories', ['name' => 'Structural'])
            ->assertForbidden();
    }

    public function test_engineer_can_create_construction_snag_with_new_taxonomy(): void
    {
        [$organization, $engineer, $project] = $this->bootstrapOrganization('engineer');

        $area = Area::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
        ]);
        $building = Building::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'area_id' => $area->id,
        ]);
        $drawing = Drawing::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
        ]);
        $category = SnagCategory::factory()->create(['organization_id' => $organization->id]);
        $sourceCompany = StakeholderCompany::factory()->create([
            'organization_id' => $organization->id,
            'type' => 'consultant',
        ]);

        Sanctum::actingAs($engineer);

        $response = $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'building_id' => $building->id,
                'area_id' => $area->id,
                'location_text' => 'Behind the riser, near grid C4',
                'category_id' => $category->id,
                'source_organization_id' => $sourceCompany->id,
                'severity' => 'major',
                'title' => 'Cracked structural beam',
                'description' => 'Observed during structural walkthrough',
                'pin_x' => 0.4,
                'pin_y' => 0.6,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.severity', 'major')
            ->assertJsonPath('data.snag_type', 'construction')
            ->assertJsonPath('data.area_id', $area->id)
            ->assertJsonPath('data.category_id', $category->id)
            ->assertJsonPath('data.source_organization_id', $sourceCompany->id)
            ->assertJsonPath('data.location_text', 'Behind the riser, near grid C4');
    }

    public function test_operational_snag_can_be_created_without_a_drawing(): void
    {
        [$organization, $engineer, $project] = $this->bootstrapOrganization('engineer');
        Sanctum::actingAs($engineer);

        $response = $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'snag_type' => 'operational',
                'title' => 'Chiller pump running hot',
                'description' => 'Raised during operational inspection',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.snag_type', 'operational')
            ->assertJsonPath('data.drawing_id', null)
            ->assertJsonPath('data.pin_x', null);

        $this->assertDatabaseHas('snags', [
            'project_id' => $project->id,
            'snag_type' => 'operational',
            'title' => 'Chiller pump running hot',
        ]);
    }

    public function test_construction_snag_still_requires_a_drawing(): void
    {
        [$organization, $engineer, $project] = $this->bootstrapOrganization('engineer');
        Sanctum::actingAs($engineer);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'title' => 'Missing drawing on construction snag',
                'pin_x' => 0.4,
                'pin_y' => 0.6,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['drawing_id']);
    }

    public function test_snag_attachment_accepts_a_lifecycle_phase(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
        ]);

        $attachment = SnagAttachment::create([
            'snag_id' => $snag->id,
            'organization_id' => $organization->id,
            'uploaded_by' => $owner->id,
            'type' => 'photo',
            'phase' => 'closure',
        ]);

        $this->assertDatabaseHas('snag_attachments', [
            'id' => $attachment->id,
            'phase' => 'closure',
        ]);
    }

    public function test_reassignment_records_an_audited_reason(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $memberA = User::factory()->create();
        $memberB = User::factory()->create();
        $organization->users()->attach($memberA->id, ['is_active' => true]);
        $organization->users()->attach($memberB->id, ['is_active' => true]);

        $snag = \App\Models\Snag::factory()->create([
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
                'assignment_reason' => 'Reassigned to the day-shift lead',
            ])
            ->assertOk();

        $this->assertDatabaseHas('snags', ['id' => $snag->id, 'assigned_to' => $memberB->id]);
        $this->assertDatabaseHas('snag_status_histories', [
            'snag_id' => $snag->id,
            'changed_by' => $owner->id,
            'note' => 'Reassigned to the day-shift lead',
        ]);
    }

    public function test_bulk_assignment_to_company_records_a_reason(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $company = StakeholderCompany::factory()->create(['organization_id' => $organization->id]);
        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags/bulk-update', [
                'snag_ids' => [$snag->id],
                'assigned_company_id' => $company->id,
                'assignment_reason' => 'Batch-assigned to the MEP contractor',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        $this->assertDatabaseHas('snags', ['id' => $snag->id, 'assigned_company_id' => $company->id]);
        $this->assertDatabaseHas('snag_status_histories', [
            'snag_id' => $snag->id,
            'note' => 'Batch-assigned to the MEP contractor',
        ]);
    }

    public function test_role_permission_matrix_is_readable(): void
    {
        [$organization, $owner] = $this->bootstrapOrganization('owner');
        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->getJson('/api/rbac/role-matrix')
            ->assertOk()
            ->assertJsonStructure(['data' => ['permissions', 'roles' => [['name', 'permissions']]]])
            ->assertJsonFragment(['name' => 'contractor_submitter']);
    }

    public function test_single_reassignment_without_a_reason_is_rejected(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $memberA = User::factory()->create();
        $memberB = User::factory()->create();
        $organization->users()->attach($memberA->id, ['is_active' => true]);
        $organization->users()->attach($memberB->id, ['is_active' => true]);

        $snag = \App\Models\Snag::factory()->create([
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
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['assignment_reason']);

        // Reassignment is rejected wholesale — the original assignee is untouched.
        $this->assertDatabaseHas('snags', ['id' => $snag->id, 'assigned_to' => $memberA->id]);
    }

    public function test_first_time_assignment_does_not_require_a_reason(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $member = User::factory()->create();
        $organization->users()->attach($member->id, ['is_active' => true]);

        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
            'assigned_to' => null,
            'status' => 'new',
        ]);

        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->putJson("/api/snags/{$snag->id}", [
                'assigned_to' => $member->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $member->id);
    }

    public function test_bulk_reassignment_without_a_reason_is_rejected(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $memberA = User::factory()->create();
        $organization->users()->attach($memberA->id, ['is_active' => true]);
        $company = StakeholderCompany::factory()->create(['organization_id' => $organization->id]);

        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
            'assigned_to' => $memberA->id,
            'status' => 'assigned',
        ]);

        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags/bulk-update', [
                'snag_ids' => [$snag->id],
                'assigned_company_id' => $company->id,
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('snags', ['id' => $snag->id, 'assigned_company_id' => null]);
    }

    public function test_bulk_assignment_to_a_team_not_on_the_project_is_rejected(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $otherProject = Project::factory()->create(['organization_id' => $organization->id]);
        $company = StakeholderCompany::factory()->create(['organization_id' => $organization->id]);
        $team = StakeholderTeam::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $otherProject->id,
            'company_id' => $company->id,
        ]);

        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
            'assigned_to' => null,
            'status' => 'new',
        ]);

        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->postJson('/api/snags/bulk-update', [
                'snag_ids' => [$snag->id],
                'assigned_team_id' => $team->id,
            ])
            ->assertStatus(422);

        $this->assertDatabaseHas('snags', ['id' => $snag->id, 'assigned_team_id' => null]);
    }

    public function test_single_assignment_to_a_team_not_on_the_project_is_rejected(): void
    {
        [$organization, $owner, $project] = $this->bootstrapOrganization('owner');

        $otherProject = Project::factory()->create(['organization_id' => $organization->id]);
        $company = StakeholderCompany::factory()->create(['organization_id' => $organization->id]);
        $team = StakeholderTeam::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $otherProject->id,
            'company_id' => $company->id,
        ]);

        $snag = \App\Models\Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $owner->id,
            'assigned_to' => null,
            'status' => 'new',
        ]);

        Sanctum::actingAs($owner);

        $this->withHeaders(['X-Organization-Id' => (string) $organization->id])
            ->putJson("/api/snags/{$snag->id}", [
                'assigned_team_id' => $team->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['assigned_team_id']);
    }
}
