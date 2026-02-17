<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\CloseoutInstance;
use App\Models\CloseoutInstanceItem;
use App\Models\CloseoutTemplate;
use App\Models\CloseoutTemplateItem;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class SnagTransitionTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_transition_is_rejected_and_valid_path_is_allowed(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $engineer = User::factory()->create();

        $organization->users()->attach($manager->id, ['is_active' => true]);
        $organization->users()->attach($engineer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');
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
            'status' => SnagStatus::New->value,
            'created_by' => $manager->id,
            'assigned_to' => null,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::ReadyForReview->value,
            ])
            ->assertStatus(422);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Assigned->value,
                'assigned_to' => $engineer->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', SnagStatus::Assigned->value);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::InProgress->value,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', SnagStatus::InProgress->value);

        $this->assertDatabaseHas('snag_status_histories', [
            'snag_id' => $snag->id,
            'to_status' => SnagStatus::Assigned->value,
        ]);

        $this->assertDatabaseHas('snag_status_histories', [
            'snag_id' => $snag->id,
            'to_status' => SnagStatus::InProgress->value,
        ]);
    }

    public function test_close_transition_requires_closeout_completion_without_override_permission(): void
    {
        Storage::fake('public');

        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $engineer = User::factory()->create();
        $organization->users()->attach($manager->id, ['is_active' => true]);
        $organization->users()->attach($engineer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');
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
            'status' => SnagStatus::ReadyForReview->value,
            'created_by' => $manager->id,
            'assigned_to' => $engineer->id,
        ]);

        $template = CloseoutTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Guard Template',
            'trade' => 'MEP',
            'is_default' => true,
            'is_active' => true,
            'created_by' => $manager->id,
        ]);

        $templateItem = CloseoutTemplateItem::query()->create([
            'closeout_template_id' => $template->id,
            'title' => 'Required evidence',
            'required' => true,
            'evidence_required' => true,
            'sort_order' => 1,
        ]);

        $instance = CloseoutInstance::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'snag_id' => $snag->id,
            'closeout_template_id' => $template->id,
            'status' => 'in_progress',
            'completion_percentage' => 0,
            'created_by' => $manager->id,
        ]);

        CloseoutInstanceItem::query()->create([
            'closeout_instance_id' => $instance->id,
            'closeout_template_item_id' => $templateItem->id,
            'title' => $templateItem->title,
            'required' => true,
            'evidence_required' => true,
            'is_completed' => false,
            'completed_by' => null,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Closed->value,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.to_status.0', 'Closeout must be 100% complete (including required evidence) before closing this snag.');
    }

    public function test_close_override_permission_allows_closing_without_closeout_completion(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $admin = User::factory()->create();
        $engineer = User::factory()->create();
        $organization->users()->attach($admin->id, ['is_active' => true]);
        $organization->users()->attach($engineer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $admin->assignRole('org_admin');
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
            'status' => SnagStatus::ReadyForReview->value,
            'created_by' => $admin->id,
            'assigned_to' => $engineer->id,
        ]);

        Sanctum::actingAs($admin);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Closed->value,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', SnagStatus::Closed->value);
    }
}

