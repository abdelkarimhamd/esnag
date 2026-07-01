<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

use function setPermissionsTeamId;

class E2ESmokeFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_to_web_api_smoke_flow_runs_end_to_end(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create([
            'email' => 'manager.smoke@example.test',
            'password' => 'password',
        ]);

        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
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

        $loginResponse = $this->postJson('/api/auth/mobile-login', [
            'email' => $manager->email,
            'password' => 'password',
            'device_name' => 'smoke-suite',
        ]);

        $loginResponse->assertOk();
        $featureFlags = (array) $loginResponse->json('organizations.0.feature_flags');
        $this->assertArrayHasKey('ui.simple_first_v1', $featureFlags);
        $this->assertTrue((bool) $featureFlags['ui.simple_first_v1']);
        $token = (string) $loginResponse->json('token');
        $this->assertNotSame('', $token);

        $headers = [
            'Authorization' => 'Bearer '.$token,
            'X-Organization-Id' => (string) $organization->id,
        ];

        $createSnagResponse = $this->withHeaders($headers)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'smoke-snag-create',
                        'type' => 'snag.create',
                        'client_updated_at' => now()->toISOString(),
                        'payload' => [
                            'client_uuid' => '75fca554-8879-4351-90a8-ddc390f9f2a0',
                            'project_id' => $project->id,
                            'drawing_id' => $drawing->id,
                            'building_id' => $building->id,
                            'floor_id' => $floor->id,
                            'location_id' => $location->id,
                            'title' => 'Smoke flow snag',
                            'description' => 'Created by E2E smoke flow',
                            'priority' => 'high',
                            'pin_x' => 0.45,
                            'pin_y' => 0.51,
                        ],
                    ],
                ],
            ]);

        $createSnagResponse->assertOk()
            ->assertJsonPath('data.0.status', 'applied');

        $snagId = (int) $createSnagResponse->json('data.0.result.snag_id');
        $this->assertGreaterThan(0, $snagId);

        $this->withHeaders($headers)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'smoke-comment-create',
                        'type' => 'snag.comment.create',
                        'payload' => [
                            'snag_id' => $snagId,
                            'client_uuid' => '4b2d8f52-97ef-4f0d-93ce-ab5a4ba5a11f',
                            'body' => 'Comment synced from mobile queue.',
                        ],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'applied');

        $this->withHeaders($headers)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'smoke-transition-assigned',
                        'type' => 'snag.transition',
                        'payload' => [
                            'snag_id' => $snagId,
                            'to_status' => SnagStatus::Assigned->value,
                            'assigned_to' => $manager->id,
                        ],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.0.status', 'applied')
            ->assertJsonPath('data.0.result.status', SnagStatus::Assigned->value);

        $this->withHeaders($headers)
            ->getJson("/api/snags/{$snagId}")
            ->assertOk()
            ->assertJsonPath('data.workflow.current_status', SnagStatus::Assigned->value)
            ->assertJsonPath('data.workflow.recommended_next_status', SnagStatus::InProgress->value);

        $this->withHeaders($headers)
            ->getJson('/api/projects?per_page=10&sort=recent_activity')
            ->assertOk()
            ->assertJsonPath('data.0.id', $project->id);

        $this->withHeaders($headers)
            ->getJson("/api/kanban/snags?project_id={$project->id}&scope=mine&due_window=all")
            ->assertOk()
            ->assertJsonPath('data.filters.scope', 'mine')
            ->assertJsonPath('data.filters.due_window', 'all');

        $equipmentResponse = $this->withHeaders($headers)
            ->postJson('/api/equipment', [
                'project_id' => $project->id,
                'location_id' => $location->id,
                'code' => 'EQ-SMOKE-01',
                'name' => 'Smoke Pump',
                'status' => 'ok',
            ]);

        $equipmentResponse->assertCreated();
        $equipmentId = (int) $equipmentResponse->json('data.id');

        $this->withHeaders($headers)
            ->postJson("/api/equipment/{$equipmentId}/logs", [
                'snag_id' => $snagId,
                'status' => 'warn',
                'description' => 'Linked maintenance finding.',
            ])
            ->assertCreated();

        $this->withHeaders($headers)
            ->postJson('/api/exports', [
                'type' => 'csv',
                'project_id' => $project->id,
                'filters' => [
                    'status' => [SnagStatus::Assigned->value],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $pullResponse = $this->withHeaders($headers)
            ->getJson('/api/mobile/sync/pull');

        $pullResponse->assertOk()
            ->assertJsonPath('meta.conflict_policy', 'last_write_wins_except_status_transition_guarded_server_side');

        $this->assertTrue(
            collect($pullResponse->json('data.snags'))->contains(fn (array $snag) => (int) ($snag['id'] ?? 0) === $snagId)
        );
        $this->assertTrue(
            collect($pullResponse->json('data.equipment'))->contains(fn (array $equipment) => (int) ($equipment['id'] ?? 0) === $equipmentId)
        );
    }
}
