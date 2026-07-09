<?php

namespace Tests\Feature;

use App\Models\Area;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\ExportJob;
use App\Models\Floor;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\SnagCategory;
use App\Models\StakeholderCompany;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class ExportPipelineTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_request_export_and_download_completed_file(): void
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

        Snag::factory()->count(5)->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'created_by' => $manager->id,
            'assigned_to' => $engineer->id,
        ]);

        Sanctum::actingAs($manager);

        $createResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', [
                'type' => 'csv',
                'project_id' => $project->id,
                'filters' => [
                    'status' => ['new', 'assigned', 'in_progress', 'ready_for_review'],
                ],
            ]);

        $createResponse->assertCreated()->assertJsonPath('data.type', 'csv');

        $exportId = (int) $createResponse->json('data.id');

        $this->assertDatabaseHas('export_jobs', [
            'id' => $exportId,
            'organization_id' => $organization->id,
            'requested_by' => $manager->id,
            'type' => 'csv',
            'status' => 'completed',
        ]);

        /** @var ExportJob $exportJob */
        $exportJob = ExportJob::query()->findOrFail($exportId);
        $this->assertNotNull($exportJob->file_path);
        Storage::disk('public')->assertExists($exportJob->file_path);
        $csvPayload = Storage::disk('public')->get($exportJob->file_path);
        $this->assertStringContainsString('Reference / المرجع', $csvPayload);
        $this->assertStringContainsString('Status / الحالة', $csvPayload);
        $manager->refresh();
        $latestNotification = $manager->notifications()->latest()->first();
        $this->assertNotNull($latestNotification);
        $this->assertSame('export_ready', $latestNotification->data['type'] ?? null);
        $this->assertSame('esnagging://exports/'.$exportJob->id, $latestNotification->data['deep_link'] ?? null);

        $showResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson("/api/exports/{$exportJob->id}");
        $showResponse
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.id', $exportJob->id);

        $downloadResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->get("/api/exports/{$exportJob->id}/download");

        $downloadResponse->assertOk();
        $this->assertTrue(
            str_contains((string) $downloadResponse->headers->get('content-type'), 'text/csv')
                || str_contains((string) $downloadResponse->headers->get('content-type'), 'application/octet-stream')
        );
    }

    public function test_snag_export_includes_the_reworked_snag_columns(): void
    {
        Storage::fake('public');

        $organization = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $organization->users()->attach($manager->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');

        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $area = Area::factory()->create(['organization_id' => $organization->id, 'project_id' => $project->id, 'name' => 'North Precinct']);
        $building = Building::factory()->create(['organization_id' => $organization->id, 'project_id' => $project->id, 'area_id' => $area->id, 'name' => 'Villa 12']);
        $category = SnagCategory::factory()->create(['organization_id' => $organization->id, 'name' => 'Structural']);
        $sourceOrg = StakeholderCompany::factory()->create(['organization_id' => $organization->id, 'type' => 'consultant', 'name' => 'DAR Consulting']);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
            'area_id' => $area->id,
            'category_id' => $category->id,
            'source_organization_id' => $sourceOrg->id,
            'severity' => 'major',
            'snag_type' => 'construction',
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($manager);
        $exportId = (int) $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', ['type' => 'csv', 'project_id' => $project->id])
            ->assertCreated()
            ->json('data.id');

        $exportJob = ExportJob::query()->findOrFail($exportId);
        $csv = Storage::disk('public')->get($exportJob->file_path);

        // New heading columns.
        $this->assertStringContainsString('Severity / التصنيف', $csv);
        $this->assertStringContainsString('Area / المنطقة', $csv);
        $this->assertStringContainsString('Source Organization', $csv);
        // New data values.
        $this->assertStringContainsString('major', $csv);
        $this->assertStringContainsString('North Precinct', $csv);
        $this->assertStringContainsString('Villa 12', $csv);
        $this->assertStringContainsString('Structural', $csv);
        $this->assertStringContainsString('DAR Consulting', $csv);
    }

    public function test_export_index_returns_requester_file_size_and_language_org_scoped(): void
    {
        Storage::fake('public');

        $organization = Organization::factory()->create();
        $otherOrganization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create(['name' => 'Dana Manager']);
        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        // Job in the manager's org: completed, bilingual, with a known file size.
        $ownJob = ExportJob::factory()->create([
            'organization_id' => $organization->id,
            'requested_by' => $manager->id,
            'project_id' => $project->id,
            'type' => 'csv',
            'status' => 'completed',
            'file_name' => 'own_export.csv',
            'file_path' => 'exports/own_export.csv',
            'file_size' => 4096,
            'mime_type' => 'text/csv',
            'language' => 'bilingual',
        ]);

        // Job in another org — must never appear for this user.
        $foreignManager = User::factory()->create(['name' => 'Foreign Manager']);
        ExportJob::factory()->create([
            'organization_id' => $otherOrganization->id,
            'requested_by' => $foreignManager->id,
            'project_id' => null,
            'type' => 'pdf',
            'status' => 'completed',
            'file_size' => 9999,
            'language' => 'ar',
        ]);

        Sanctum::actingAs($manager);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/exports');

        $response->assertOk();

        $data = $response->json('data');
        $this->assertCount(1, $data, 'Only the current org export job should be returned.');

        $job = $data[0];
        $this->assertSame($ownJob->id, $job['id']);
        $this->assertSame($manager->id, $job['requester']['id']);
        $this->assertSame('Dana Manager', $job['requester']['name']);
        $this->assertSame(4096, $job['file_size']);
        $this->assertSame('bilingual', $job['language']);

        // Explicit JSON-path assertions for the frontend contract.
        $response
            ->assertJsonPath('data.0.requester.name', 'Dana Manager')
            ->assertJsonPath('data.0.file_size', 4096)
            ->assertJsonPath('data.0.language', 'bilingual');
    }

    public function test_export_store_persists_language_and_defaults_to_en(): void
    {
        Storage::fake('public');

        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        Sanctum::actingAs($manager);

        // Explicit language is persisted.
        $bilingual = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', [
                'type' => 'csv',
                'project_id' => $project->id,
                'language' => 'bilingual',
            ]);
        $bilingual->assertCreated()->assertJsonPath('data.language', 'bilingual');

        // Omitted language defaults to en.
        $default = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', [
                'type' => 'csv',
                'project_id' => $project->id,
            ]);
        $default->assertCreated()->assertJsonPath('data.language', 'en');

        // Invalid language is rejected.
        $invalid = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', [
                'type' => 'csv',
                'project_id' => $project->id,
                'language' => 'fr',
            ]);
        $invalid->assertStatus(422);
    }

    public function test_user_can_export_inspection_report_via_queue_pipeline(): void
    {
        Storage::fake('public');

        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $organization->users()->attach($manager->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Inspection Export Template',
            'code' => 'INSP-EXP-001',
            'type' => 'ncr',
            'description' => 'Template for export test',
            'schema' => [
                'sections' => [
                    [
                        'title' => 'General',
                        'fields' => [
                            ['key' => 'note', 'label' => 'Note', 'type' => 'textarea', 'required' => true],
                        ],
                    ],
                ],
            ],
            'approval_workflow' => null,
            'is_active' => true,
            'version' => 1,
            'created_by' => $manager->id,
        ]);

        InspectionSubmission::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'inspection_template_id' => $template->id,
            'reference' => 'INSP-01001',
            'status' => 'approved',
            'form_data' => ['note' => 'Approved record'],
            'current_approval_order' => null,
            'created_by' => $manager->id,
            'submitted_by' => $manager->id,
            'submitted_at' => now()->subDay(),
            'approved_at' => now()->subHours(12),
            'last_updated_by' => $manager->id,
        ]);

        Sanctum::actingAs($manager);

        $createResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/inspections/reports/export', [
                'type' => 'csv',
                'project_id' => $project->id,
                'filters' => ['status' => ['approved']],
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.type', 'csv')
            ->assertJsonPath('data.filters.module', 'inspections');

        $exportId = (int) $createResponse->json('data.id');

        $this->assertDatabaseHas('export_jobs', [
            'id' => $exportId,
            'organization_id' => $organization->id,
            'status' => 'completed',
            'type' => 'csv',
        ]);

        $exportJob = ExportJob::query()->findOrFail($exportId);
        $this->assertNotNull($exportJob->file_path);
        Storage::disk('public')->assertExists($exportJob->file_path);
        $csvPayload = Storage::disk('public')->get($exportJob->file_path);
        $this->assertStringContainsString('Reference / المرجع', $csvPayload);
        $this->assertStringContainsString('Type / النوع', $csvPayload);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->get("/api/exports/{$exportJob->id}/download")
            ->assertOk();
    }
}
