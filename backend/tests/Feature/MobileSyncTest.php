<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\DrawingLocationZone;
use App\Models\Floor;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class MobileSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_sync_applies_updates_with_lww_conflict_handling(): void
    {
        [$organization, $engineer, $snag] = $this->bootstrapSnagContext();

        Sanctum::actingAs($engineer);

        $staleTimestamp = CarbonImmutable::parse($snag->updated_at)->subDay()->toISOString();

        $staleResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'stale-update',
                        'type' => 'snag.update',
                        'client_updated_at' => $staleTimestamp,
                        'payload' => [
                            'snag_id' => $snag->id,
                            'title' => 'Offline stale title',
                            'description' => 'Should be rejected by LWW policy',
                        ],
                    ],
                ],
            ]);

        $staleResponse->assertOk()
            ->assertJsonPath('data.0.op_id', 'stale-update')
            ->assertJsonPath('data.0.status', 'applied')
            ->assertJsonPath('data.0.result.conflict', true)
            ->assertJsonPath('data.0.result.policy', 'last_write_wins')
            ->assertJsonPath('data.0.result.resolution_options.0', 'use_server')
            ->assertJsonPath('data.0.result.resolution_options.1', 'retry_local')
            ->assertJsonPath('data.0.result.resolution_options.2', 'merge')
            ->assertJsonPath('data.0.result.local.snag_id', $snag->id);

        $this->assertDatabaseMissing('snags', [
            'id' => $snag->id,
            'title' => 'Offline stale title',
        ]);

        $freshTimestamp = CarbonImmutable::parse($snag->updated_at)->addMinutes(2)->toISOString();

        $freshResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'fresh-update',
                        'type' => 'snag.update',
                        'client_updated_at' => $freshTimestamp,
                        'payload' => [
                            'snag_id' => $snag->id,
                            'title' => 'Offline merged title',
                            'description' => 'Applied once online',
                        ],
                    ],
                ],
            ]);

        $freshResponse->assertOk()
            ->assertJsonPath('data.0.op_id', 'fresh-update')
            ->assertJsonPath('data.0.status', 'applied')
            ->assertJsonPath('data.0.result.snag_id', $snag->id);

        $this->assertDatabaseHas('snags', [
            'id' => $snag->id,
            'title' => 'Offline merged title',
            'description' => 'Applied once online',
        ]);
    }

    public function test_mobile_sync_status_transition_remains_server_guarded(): void
    {
        [$organization, $engineer, $snag] = $this->bootstrapSnagContext();

        Sanctum::actingAs($engineer);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/mobile/sync/apply', [
                'operations' => [
                    [
                        'op_id' => 'invalid-transition',
                        'type' => 'snag.transition',
                        'payload' => [
                            'snag_id' => $snag->id,
                            'to_status' => SnagStatus::ReadyForReview->value,
                            'note' => 'Attempted invalid jump while offline.',
                        ],
                    ],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.0.op_id', 'invalid-transition')
            ->assertJsonPath('data.0.status', 'rejected')
            ->assertJsonPath('data.0.errors.to_status.0', 'Invalid status transition for the current snag state.');

        $this->assertDatabaseHas('snags', [
            'id' => $snag->id,
            'status' => SnagStatus::New->value,
        ]);
    }

    public function test_mobile_chunked_upload_creates_snag_attachment(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        [$organization, $engineer, $snag] = $this->bootstrapSnagContext();

        Sanctum::actingAs($engineer);

        $pngPayload = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAEAQH/cetR9QAAAABJRU5ErkJggg==') ?: '';
        $chunkA = substr($pngPayload, 0, max(1, (int) floor(strlen($pngPayload) / 2)));
        $chunkB = substr($pngPayload, strlen($chunkA));

        $initResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/mobile/attachments/chunked/init', [
                'snag_id' => $snag->id,
                'file_name' => 'offline-photo.png',
                'mime_type' => 'image/png',
                'total_chunks' => 2,
                'file_size' => strlen($pngPayload),
            ]);

        $initResponse->assertCreated();
        $sessionId = (int) $initResponse->json('data.upload_session_id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->post("/api/mobile/attachments/chunked/{$sessionId}/chunk", [
                'chunk_index' => 0,
                'chunk' => UploadedFile::fake()->createWithContent('chunk_0.part', $chunkA),
            ])
            ->assertOk()
            ->assertJsonPath('data.received_count', 1);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->post("/api/mobile/attachments/chunked/{$sessionId}/chunk", [
                'chunk_index' => 1,
                'chunk' => UploadedFile::fake()->createWithContent('chunk_1.part', $chunkB),
            ])
            ->assertOk()
            ->assertJsonPath('data.received_count', 2);

        $completeResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/mobile/attachments/chunked/{$sessionId}/complete", [
                'client_uuid' => 'df671d54-2f9f-4267-b1c5-ae1293f9fba8',
            ]);

        $completeResponse->assertCreated()
            ->assertJsonPath('data.snag_id', $snag->id)
            ->assertJsonPath('data.type', 'photo')
            ->assertJsonPath('data.mime_type', 'image/png')
            ->assertJsonPath('data.client_uuid', 'df671d54-2f9f-4267-b1c5-ae1293f9fba8');

        $path = $completeResponse->json('data.file_path');
        Storage::disk('public')->assertExists($path);
    }

    public function test_mobile_chunked_upload_accepts_markup_annotation_json(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        [$organization, $engineer, $snag] = $this->bootstrapSnagContext();

        Sanctum::actingAs($engineer);

        $markupPayload = json_encode([
            'version' => 1,
            'kind' => 'offline_annotation',
            'strokes' => [
                [
                    ['x' => 0.2, 'y' => 0.3],
                    ['x' => 0.28, 'y' => 0.37],
                ],
            ],
        ], JSON_THROW_ON_ERROR);

        $initResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/mobile/attachments/chunked/init', [
                'snag_id' => $snag->id,
                'file_name' => 'annotation.json',
                'mime_type' => 'application/json',
                'total_chunks' => 1,
                'file_size' => strlen($markupPayload),
            ]);

        $initResponse->assertCreated();
        $sessionId = (int) $initResponse->json('data.upload_session_id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->post("/api/mobile/attachments/chunked/{$sessionId}/chunk", [
                'chunk_index' => 0,
                'chunk' => UploadedFile::fake()->createWithContent('chunk_0.part', $markupPayload),
            ])
            ->assertOk()
            ->assertJsonPath('data.received_count', 1);

        $completeResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/mobile/attachments/chunked/{$sessionId}/complete", [
                'client_uuid' => 'db39e7f8-81c8-4676-b9c8-6446b5f56288',
            ]);

        $completeResponse->assertCreated()
            ->assertJsonPath('data.snag_id', $snag->id)
            ->assertJsonPath('data.type', 'markup')
            ->assertJsonPath('data.client_uuid', 'db39e7f8-81c8-4676-b9c8-6446b5f56288')
            ->assertJsonPath('data.markup_data.kind', 'offline_annotation');

        $path = (string) $completeResponse->json('data.file_path');
        Storage::disk('public')->assertExists($path);
    }

    public function test_mobile_pull_includes_floor_map_entities_for_offline_navigation(): void
    {
        [$organization, $engineer, $snag] = $this->bootstrapSnagContext();

        $location = Location::factory()->create([
            'organization_id' => $organization->id,
            'floor_id' => $snag->floor_id,
        ]);

        DrawingLocationZone::factory()->create([
            'organization_id' => $organization->id,
            'drawing_id' => $snag->drawing_id,
            'drawing_revision_id' => null,
            'location_id' => $location->id,
            'x_min' => 0.1,
            'y_min' => 0.2,
            'x_max' => 0.25,
            'y_max' => 0.35,
            'priority' => 120,
            'created_by' => $engineer->id,
        ]);

        Sanctum::actingAs($engineer);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/mobile/sync/pull');

        $response->assertOk();

        $this->assertTrue(
            collect($response->json('data.buildings'))->contains(fn (array $row) => (int) ($row['id'] ?? 0) === (int) $snag->building_id)
        );
        $this->assertTrue(
            collect($response->json('data.floors'))->contains(fn (array $row) => (int) ($row['id'] ?? 0) === (int) $snag->floor_id)
        );
        $this->assertTrue(
            collect($response->json('data.locations'))->contains(fn (array $row) => (int) ($row['id'] ?? 0) === $location->id)
        );
        $this->assertTrue(
            collect($response->json('data.drawing_location_zones'))->contains(fn (array $row) => (int) ($row['location_id'] ?? 0) === $location->id)
        );
    }

    /**
     * @return array{0: Organization, 1: User, 2: Snag}
     */
    private function bootstrapSnagContext(): array
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
            'assigned_to' => $engineer->id,
        ]);

        return [$organization, $engineer, $snag];
    }
}
