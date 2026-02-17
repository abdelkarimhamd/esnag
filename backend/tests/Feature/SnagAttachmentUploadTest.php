<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class SnagAttachmentUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_project_manager_can_upload_drawing_revision_and_snag_attachment(): void
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
            'created_by' => $manager->id,
        ]);

        Sanctum::actingAs($manager);

        $revisionResponse = $this->withHeaders([
            'X-Organization-Id' => (string) $organization->id,
            'Accept' => 'application/json',
        ])->post("/api/drawings/{$drawing->id}/revisions", [
                'revision_label' => 'R1',
                'file' => UploadedFile::fake()->image('plan.png', 1200, 900),
                'set_current' => true,
            ]);

        $revisionResponse->assertCreated();

        $revisionPath = $revisionResponse->json('data.file_path');

        $this->assertDatabaseHas('drawing_revisions', [
            'drawing_id' => $drawing->id,
            'revision_label' => 'R1',
        ]);
        Storage::disk('public')->assertExists($revisionPath);

        $attachmentResponse = $this->withHeaders([
            'X-Organization-Id' => (string) $organization->id,
            'Accept' => 'application/json',
        ])->post("/api/snags/{$snag->id}/attachments", [
                'type' => 'photo',
                'file' => UploadedFile::fake()->image('snag-photo.jpg', 1024, 768),
            ]);

        $attachmentResponse->assertCreated();

        $attachmentPath = $attachmentResponse->json('data.file_path');

        $this->assertDatabaseHas('snag_attachments', [
            'snag_id' => $snag->id,
            'type' => 'photo',
        ]);
        Storage::disk('public')->assertExists($attachmentPath);
    }
}

