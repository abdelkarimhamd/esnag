<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\CloseoutTemplate;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class UxAdoptionExtrasTest extends TestCase
{
    use RefreshDatabase;

    public function test_template_library_entries_can_be_listed_and_cloned(): void
    {
        [$organization, $manager] = $this->bootstrapOrganizationWithManager();

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $closeoutLibrary = CloseoutTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => null,
            'name' => 'Library: Civil Handover',
            'trade' => 'Civil',
            'discipline' => 'Civil',
            'description' => 'Seed library template',
            'is_default' => false,
            'is_active' => true,
            'is_library' => true,
            'library_key' => 'closeout_civil_handover_v1',
            'created_by' => $manager->id,
        ]);

        $closeoutLibrary->items()->create([
            'title' => 'Concrete finishing complete',
            'required' => true,
            'evidence_required' => true,
            'sort_order' => 0,
        ]);

        $inspectionLibrary = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => null,
            'name' => 'Library: Safety Walk',
            'code' => 'LIB-SAFE-001',
            'type' => 'safety',
            'discipline' => 'Safety',
            'description' => 'Seed library inspection template',
            'schema' => [
                'sections' => [
                    [
                        'title' => 'General',
                        'fields' => [
                            ['key' => 'remark', 'label' => 'Remark', 'type' => 'textarea', 'required' => true],
                        ],
                    ],
                ],
            ],
            'approval_workflow' => [
                ['step_order' => 1, 'step_name' => 'Review', 'role_name' => 'inspector', 'requires_signature' => false],
            ],
            'is_active' => true,
            'is_library' => true,
            'library_key' => 'inspection_safety_walk_v1',
            'version' => 1,
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/closeout/templates?library_only=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $closeoutLibrary->id)
            ->assertJsonPath('data.0.is_library', true);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/closeout/templates/{$closeoutLibrary->id}/clone", [
                'project_id' => $project->id,
                'name' => 'Civil Handover - Project Copy',
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_library', false)
            ->assertJsonPath('data.project_id', $project->id);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/inspections/templates?library_only=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $inspectionLibrary->id)
            ->assertJsonPath('data.0.is_library', true);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/templates/{$inspectionLibrary->id}/clone", [
                'project_id' => $project->id,
                'name' => 'Safety Walk - Project Copy',
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_library', false)
            ->assertJsonPath('data.project_id', $project->id);
    }

    public function test_training_project_blocks_mutating_snag_create_requests(): void
    {
        [$organization, $manager] = $this->bootstrapOrganizationWithManager();

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
            'is_training' => true,
            'training_locked' => true,
            'training_notes' => 'Training mode test',
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

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'building_id' => $building->id,
                'floor_id' => $floor->id,
                'title' => 'Training mode snag',
                'description' => 'Should be blocked',
                'priority' => 'medium',
                'pin_x' => 0.4,
                'pin_y' => 0.6,
            ])
            ->assertStatus(423)
            ->assertJsonPath('message', 'Training project is read-only. Switch to a live project to apply changes.');
    }

    public function test_bulk_assign_due_date_and_export_workflow(): void
    {
        [$organization, $manager] = $this->bootstrapOrganizationWithManager();

        $assignee = User::factory()->create();
        $organization->users()->attach($assignee->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $assignee->assignRole('engineer');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
            'is_training' => false,
            'training_locked' => false,
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

        $snags = Snag::factory()->count(3)->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'created_by' => $manager->id,
            'assigned_to' => null,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/snags/bulk-update', [
                'snag_ids' => $snags->pluck('id')->values()->all(),
                'assigned_to' => $assignee->id,
                'due_date' => '2026-03-15',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 3);

        $this->assertDatabaseHas('snags', [
            'id' => $snags->first()->id,
            'assigned_to' => $assignee->id,
        ]);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/snags/bulk-export', [
                'type' => 'csv',
                'snag_ids' => $snags->pluck('id')->take(2)->values()->all(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.type', 'csv')
            ->assertJsonPath('data.filters.module', 'snags')
            ->assertJsonPath('data.status', 'completed');
    }

    /**
     * @return array{Organization, User}
     */
    private function bootstrapOrganizationWithManager(): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');

        return [$organization, $manager];
    }
}
