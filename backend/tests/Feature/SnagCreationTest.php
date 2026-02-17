<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
use App\Models\DrawingRevision;
use App\Models\Floor;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class SnagCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_engineer_can_create_snag_with_pin_and_history_entry(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $engineer = User::factory()->create();
        $organization->users()->attach($engineer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $engineer->assignRole('engineer');

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
        ]);

        $drawing = Drawing::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
        ]);

        $revision = DrawingRevision::factory()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $drawing->id,
            'is_current' => true,
        ]);

        $drawing->update(['current_revision_id' => $revision->id]);

        Sanctum::actingAs($engineer);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'drawing_revision_id' => $revision->id,
                'building_id' => $building->id,
                'floor_id' => $floor->id,
                'location_id' => $location->id,
                'title' => 'Test snag from viewer',
                'description' => 'Detected at QA walkthrough',
                'priority' => 'high',
                'pin_x' => 0.42,
                'pin_y' => 0.67,
            ]);

        $response->assertCreated()->assertJsonPath('data.status', 'new');

        $this->assertDatabaseHas('snags', [
            'organization_id' => $organization->id,
            'title' => 'Test snag from viewer',
            'status' => 'new',
        ]);

        $this->assertDatabaseCount('snag_status_histories', 1);
    }
}

