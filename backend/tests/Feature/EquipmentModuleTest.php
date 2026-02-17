<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
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

class EquipmentModuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_equipment_and_maintenance_log_can_be_linked_to_snag(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $engineer = User::factory()->create();
        $manager = User::factory()->create();

        $organization->users()->attach($engineer->id, ['is_active' => true]);
        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $engineer->assignRole('engineer');
        $manager->assignRole('project_manager');

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

        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'location_id' => $location->id,
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($engineer);

        $equipmentResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/equipment', [
                'project_id' => $project->id,
                'location_id' => $location->id,
                'code' => 'EQ-TEST-001',
                'name' => 'Test Air Handling Unit',
                'category' => 'mep',
                'barcode' => 'EQBC-001122',
                'status' => 'ok',
            ]);

        $equipmentResponse->assertCreated()
            ->assertJsonPath('data.code', 'EQ-TEST-001');

        $equipmentId = (int) $equipmentResponse->json('data.id');

        $logResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/equipment/{$equipmentId}/logs", [
                'snag_id' => $snag->id,
                'status' => 'warn',
                'description' => 'Filter blockage noted during maintenance visit.',
                'action_taken' => 'Filter replaced and fan balance checked.',
            ]);

        $logResponse->assertCreated()
            ->assertJsonPath('data.status', 'warn')
            ->assertJsonPath('data.snag.id', $snag->id);

        $this->assertDatabaseHas('equipments', [
            'id' => $equipmentId,
            'status' => 'warn',
        ]);

        $this->assertDatabaseHas('equipment_maintenance_logs', [
            'equipment_id' => $equipmentId,
            'snag_id' => $snag->id,
            'status' => 'warn',
        ]);

        $this->assertDatabaseHas('snags', [
            'id' => $snag->id,
            'equipment_id' => $equipmentId,
        ]);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson("/api/equipment/{$equipmentId}")
            ->assertOk()
            ->assertJsonPath('data.id', $equipmentId)
            ->assertJsonPath('data.maintenance_logs.0.snag.id', $snag->id);
    }
}
