<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
use App\Models\DrawingLocationZone;
use App\Models\DrawingRevision;
use App\Models\DrawingRevisionMapping;
use App\Models\Floor;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class DrawingIntelligenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_pin_migration_supports_preview_and_apply(): void
    {
        [$organization, $manager] = $this->createOrganizationWithRole('project_manager');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

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

        $sourceRevision = DrawingRevision::factory()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'revision_label' => 'R1',
        ]);

        $targetRevision = DrawingRevision::factory()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'revision_label' => 'R2',
            'is_current' => true,
        ]);

        $drawing->update([
            'current_revision_id' => $targetRevision->id,
        ]);

        DrawingRevisionMapping::query()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'from_revision_id' => $sourceRevision->id,
            'to_revision_id' => $targetRevision->id,
            'transform_type' => 'offset_scale',
            'transform_params' => [
                'scale_x' => 1,
                'scale_y' => 1,
                'offset_x' => 0.1,
                'offset_y' => -0.05,
            ],
            'confidence_score' => 92,
            'created_by' => $manager->id,
        ]);

        $snagOne = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'drawing_revision_id' => $sourceRevision->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'pin_x' => 0.20,
            'pin_y' => 0.40,
            'created_by' => $manager->id,
        ]);

        $snagTwo = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'drawing_revision_id' => $sourceRevision->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'pin_x' => 0.95,
            'pin_y' => 0.10,
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/drawings/'.$drawing->id.'/migrate-pins', [
                'source_revision_id' => $sourceRevision->id,
                'target_revision_id' => $targetRevision->id,
                'dry_run' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.dry_run', true)
            ->assertJsonPath('data.applied', false)
            ->assertJsonPath('data.processed_count', 2);

        $this->assertSame($sourceRevision->id, $snagOne->fresh()->drawing_revision_id);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/drawings/'.$drawing->id.'/migrate-pins', [
                'source_revision_id' => $sourceRevision->id,
                'target_revision_id' => $targetRevision->id,
                'apply' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.applied', true)
            ->assertJsonPath('data.processed_count', 2);

        $snagOne->refresh();
        $snagTwo->refresh();

        $this->assertSame($targetRevision->id, $snagOne->drawing_revision_id);
        $this->assertEqualsWithDelta(0.30, $snagOne->pin_x, 0.000001);
        $this->assertEqualsWithDelta(0.35, $snagOne->pin_y, 0.000001);

        $this->assertSame($targetRevision->id, $snagTwo->drawing_revision_id);
        $this->assertEqualsWithDelta(1.00, $snagTwo->pin_x, 0.000001);
        $this->assertEqualsWithDelta(0.05, $snagTwo->pin_y, 0.000001);
    }

    public function test_location_suggestions_prioritize_inside_zone_location(): void
    {
        [$organization, $manager] = $this->createOrganizationWithRole('project_manager');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

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

        $locationOne = Location::factory()->create([
            'organization_id' => $organization->id,
            'floor_id' => $floor->id,
        ]);

        $locationTwo = Location::factory()->create([
            'organization_id' => $organization->id,
            'floor_id' => $floor->id,
        ]);

        DrawingLocationZone::query()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'location_id' => $locationOne->id,
            'zone_label' => 'Room 1',
            'x_min' => 0.20,
            'y_min' => 0.20,
            'x_max' => 0.35,
            'y_max' => 0.35,
            'priority' => 120,
        ]);

        DrawingLocationZone::query()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'location_id' => $locationTwo->id,
            'zone_label' => 'Room 2',
            'x_min' => 0.65,
            'y_min' => 0.65,
            'x_max' => 0.85,
            'y_max' => 0.85,
            'priority' => 120,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/drawings/'.$drawing->id.'/location-suggestions?pin_x=0.25&pin_y=0.30&limit=3')
            ->assertOk()
            ->assertJsonPath('data.suggested_location_id', $locationOne->id)
            ->assertJsonPath('data.suggestions.0.location_id', $locationOne->id)
            ->assertJsonPath('data.suggestions.0.source', 'zone_inside');
    }

    public function test_location_barcode_resolution_returns_drawing_deep_link_and_filters(): void
    {
        [$organization, $viewer] = $this->createOrganizationWithRole('viewer');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $building = Building::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
        ]);

        $floor = Floor::factory()->create([
            'organization_id' => $organization->id,
            'building_id' => $building->id,
        ]);

        $location = Location::factory()->create([
            'organization_id' => $organization->id,
            'floor_id' => $floor->id,
            'barcode' => 'LOC-QR-001',
        ]);

        $drawing = Drawing::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
        ]);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'location_id' => $location->id,
            'status' => 'in_progress',
            'created_by' => $viewer->id,
        ]);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'location_id' => $location->id,
            'status' => 'closed',
            'created_by' => $viewer->id,
        ]);

        Sanctum::actingAs($viewer);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/locations/resolve?barcode=LOC-QR-001')
            ->assertOk()
            ->assertJsonPath('data.location.id', $location->id)
            ->assertJsonPath('data.project.id', $project->id)
            ->assertJsonPath('data.drawing.id', $drawing->id)
            ->assertJsonPath('data.filters.location_id', $location->id)
            ->assertJsonPath('data.snags.total', 2)
            ->assertJsonPath('data.snags.open', 1)
            ->assertJsonPath('data.deep_link', '/projects/'.$project->id.'/drawings/'.$drawing->id.'?location_id='.$location->id.'&barcode=LOC-QR-001');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/locations/resolve?barcode=UNKNOWN-CODE')
            ->assertStatus(404);
    }

    public function test_drawing_links_to_an_area_and_derives_it_from_the_building(): void
    {
        [$organization, $owner] = $this->createOrganizationWithRole('owner');
        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $area = \App\Models\Area::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id,
        ]);
        $building = Building::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id, 'area_id' => $area->id,
        ]);

        Sanctum::actingAs($owner);
        $drawing = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/projects/{$project->id}/drawings", [
                'title' => 'Level 2 GA', 'code' => 'A-201', 'building_id' => $building->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.area_id', $area->id)
            ->json('data');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson("/api/drawings?area_id={$area->id}")
            ->assertOk()
            ->assertJsonPath('data.0.id', $drawing['id']);
    }

    public function test_last_drawing_of_a_building_cannot_be_deleted(): void
    {
        [$organization] = $this->createOrganizationWithRole('owner');
        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $building = Building::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id,
        ]);

        $only = Drawing::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id, 'building_id' => $building->id,
        ]);

        try {
            $only->delete();
            $this->fail('A building must retain at least one drawing.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('at least one drawing', $exception->getMessage());
        }
        $this->assertDatabaseHas('drawings', ['id' => $only->id]);

        // With a second drawing present, one may be deleted.
        $second = Drawing::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id, 'building_id' => $building->id,
        ]);
        $second->delete();
        $this->assertDatabaseMissing('drawings', ['id' => $second->id]);
        $this->assertDatabaseHas('drawings', ['id' => $only->id]);
    }

    public function test_aggregate_returns_building_snags_with_severity_summary(): void
    {
        [$organization, $owner] = $this->createOrganizationWithRole('owner');
        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $building = Building::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id,
        ]);

        $drawingA = Drawing::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id, 'building_id' => $building->id,
        ]);
        $drawingB = Drawing::factory()->create([
            'organization_id' => $organization->id, 'project_id' => $project->id, 'building_id' => $building->id,
        ]);

        foreach ([[$drawingA, 'major'], [$drawingA, 'high'], [$drawingB, 'medium']] as [$drawing, $severity]) {
            Snag::factory()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'building_id' => $building->id,
                'severity' => $severity,
                'pin_x' => 0.4,
                'pin_y' => 0.5,
            ]);
        }

        Sanctum::actingAs($owner);
        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson("/api/drawings/aggregate?building_id={$building->id}")
            ->assertOk()
            ->assertJsonPath('data.summary.total', 3)
            ->assertJsonPath('data.summary.by_severity.major', 1)
            ->assertJsonPath('data.summary.by_severity.high', 1)
            ->assertJsonPath('data.summary.by_severity.medium', 1)
            ->assertJsonCount(3, 'data.snags')
            ->assertJsonCount(2, 'data.drawings');
    }

    /**
     * @return array{0: Organization, 1: User}
     */
    private function createOrganizationWithRole(string $role): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $user->assignRole($role);

        return [$organization, $user];
    }
}
