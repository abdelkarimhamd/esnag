<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
use App\Models\ExportJob;
use App\Models\Floor;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
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
