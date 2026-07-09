<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Project;
use App\Models\StakeholderCompany;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * Phase 3 — handover supporting-document endpoints (BR-FR-020/021). The data
 * layer (table + model + relation) already existed; these cover the API surface.
 */
class Phase3HandoverDocumentsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Project $project;
    private User $contractor;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $this->org = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($this->org);
        $this->project = Project::factory()->create(['organization_id' => $this->org->id]);
        setPermissionsTeamId($this->org->id);

        $company = StakeholderCompany::factory()->create([
            'organization_id' => $this->org->id, 'type' => 'contractor', 'is_active' => true,
        ]);
        $this->contractor = User::factory()->create();
        $this->org->users()->attach($this->contractor->id, ['is_active' => true]);
        DB::table('company_user')->insert([
            'organization_id' => $this->org->id, 'company_id' => $company->id, 'user_id' => $this->contractor->id,
            'is_active' => true, 'is_primary' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->contractor->assignRole('contractor_submitter');
    }

    private function headers(): array
    {
        return ['X-Organization-Id' => (string) $this->org->id];
    }

    private function createRequest(): int
    {
        Sanctum::actingAs($this->contractor);

        return (int) $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Doc handover',
            ])->json('data.id');
    }

    public function test_uploads_list_and_download_a_handover_document(): void
    {
        $id = $this->createRequest();

        // Upload stamps the uploader and the current cycle pointer.
        $upload = $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/attachments", [
                'file' => UploadedFile::fake()->image('evidence.jpg', 800, 600),
            ])
            ->assertCreated()
            ->assertJsonPath('data.uploaded_by', $this->contractor->id)
            ->assertJsonPath('data.cycle_number', 1)
            ->assertJsonPath('data.uploader.id', $this->contractor->id)
            ->json('data');

        $this->assertDatabaseHas('handover_request_attachments', [
            'id' => $upload['id'],
            'handover_request_id' => $id,
            'uploaded_by' => $this->contractor->id,
            'original_name' => 'evidence.jpg',
        ]);
        Storage::disk('public')->assertExists($upload['path']);

        // Index returns it with uploader + timestamp.
        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$id}/attachments")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uploader.name', $this->contractor->name);

        // Download streams the file back.
        $this->withHeaders($this->headers())
            ->get("/api/handovers/requests/{$id}/attachments/{$upload['id']}")
            ->assertOk()
            ->assertHeader('content-disposition');
    }

    public function test_upload_requires_a_file(): void
    {
        $id = $this->createRequest();

        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/attachments", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_show_includes_attachments_with_uploader(): void
    {
        $id = $this->createRequest();
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/attachments", [
                'file' => UploadedFile::fake()->image('plan.png'),
            ])->assertCreated();

        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$id}")
            ->assertOk()
            ->assertJsonPath('data.attachments.0.original_name', 'plan.png')
            ->assertJsonPath('data.attachments.0.uploader.id', $this->contractor->id);
    }
}
