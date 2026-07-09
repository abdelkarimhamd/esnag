<?php

namespace Tests\Feature;

use App\Models\Equipment;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\SnagInspection;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class SnagInspectionTest extends TestCase
{
    use RefreshDatabase;

    private function bootstrapOrg(): array
    {
        $organization = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $inspector = User::factory()->create();
        $organization->users()->attach($inspector->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $inspector->assignRole('project_manager');

        $project = Project::factory()->create(['organization_id' => $organization->id]);
        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'created_by' => $inspector->id,
        ]);

        return [$organization, $inspector, $project, $snag];
    }

    private function headers(Organization $organization): array
    {
        return [
            'X-Organization-Id' => (string) $organization->id,
            'Accept' => 'application/json',
        ];
    }

    public function test_records_an_inspection_creating_the_asset_and_setting_maintenance_owner(): void
    {
        Storage::fake('public');
        [$organization, $inspector, , $snag] = $this->bootstrapOrg();
        Sanctum::actingAs($inspector);

        $response = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspections", [
            'status' => 'needs_maintenance',
            'asset_name' => 'AHU-3 Rooftop Unit',
            'create_asset' => true,
            'asset_category' => 'Mechanical (HVAC)',
            'maintenance_user_id' => $inspector->id,
            'notes' => 'Belt worn; schedule replacement.',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.status', 'needs_maintenance');
        $response->assertJsonPath('data.asset_name', 'AHU-3 Rooftop Unit');
        $this->assertNotNull($response->json('data.reference'));

        // A new Equipment asset was minted and linked.
        $equipmentId = $response->json('data.equipment_id');
        $this->assertNotNull($equipmentId);
        $this->assertDatabaseHas('equipments', [
            'id' => $equipmentId,
            'organization_id' => $organization->id,
            'name' => 'AHU-3 Rooftop Unit',
        ]);
        $this->assertDatabaseHas('snag_inspections', [
            'snag_id' => $snag->id,
            'maintenance_user_id' => $inspector->id,
            'inspected_by' => $inspector->id,
        ]);
    }

    public function test_records_an_inspection_against_an_existing_asset_without_creating_a_duplicate(): void
    {
        [$organization, $inspector, $project, $snag] = $this->bootstrapOrg();
        Sanctum::actingAs($inspector);

        $equipment = Equipment::create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'code' => 'AST-00001',
            'name' => 'Chiller 4',
            'status' => 'ok',
        ]);
        $before = Equipment::query()->count();

        $response = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspections", [
            'status' => 'operational',
            'equipment_id' => $equipment->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.equipment_id', $equipment->id);
        // Existing asset resolves its name; no new Equipment created.
        $response->assertJsonPath('data.asset_name', 'Chiller 4');
        $this->assertSame($before, Equipment::query()->count());
    }

    public function test_multiple_photos_and_documents_can_be_attached(): void
    {
        Storage::fake('public');
        [$organization, $inspector, , $snag] = $this->bootstrapOrg();
        Sanctum::actingAs($inspector);

        $inspection = SnagInspection::create([
            'organization_id' => $organization->id,
            'snag_id' => $snag->id,
            'reference' => 'SI-00001',
            'status' => 'operational',
            'inspected_by' => $inspector->id,
            'created_by' => $inspector->id,
        ]);

        $photo = $this->withHeaders($this->headers($organization))->post("/api/snag-inspections/{$inspection->id}/attachments", [
            'type' => 'photo',
            'file' => UploadedFile::fake()->image('condition.jpg'),
        ]);
        $photo->assertCreated();

        $doc = $this->withHeaders($this->headers($organization))->post("/api/snag-inspections/{$inspection->id}/attachments", [
            'type' => 'document',
            'file' => UploadedFile::fake()->create('report.pdf', 120, 'application/pdf'),
        ]);
        $doc->assertCreated();

        $index = $this->withHeaders($this->headers($organization))->getJson("/api/snags/{$snag->id}/inspections");
        $index->assertOk();
        $this->assertCount(2, $index->json('data.0.attachments'));
    }

    public function test_request_inspection_assigns_it_and_recording_completes_the_request(): void
    {
        [$organization, $inspector, , $snag] = $this->bootstrapOrg();
        Sanctum::actingAs($inspector);

        // 1) Request an inspection assigned to a responsible person.
        $request = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspection-requests", [
            'title' => 'Inspect the rooftop unit',
            'assigned_to' => $inspector->id,
        ]);
        $request->assertCreated();
        $request->assertJsonPath('data.status', 'requested');
        $requestId = $request->json('data.id');
        $this->assertDatabaseHas('inspection_requests', [
            'id' => $requestId,
            'snag_id' => $snag->id,
            'assigned_to' => $inspector->id,
        ]);

        // 2) The assigned team lists the request on the snag.
        $list = $this->withHeaders($this->headers($organization))->getJson("/api/snags/{$snag->id}/inspection-requests");
        $list->assertOk();
        $this->assertCount(1, $list->json('data'));

        // 3) Recording the inspection against the request completes it.
        $inspection = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspections", [
            'status' => 'operational',
            'inspection_request_id' => $requestId,
        ]);
        $inspection->assertCreated();
        $this->assertDatabaseHas('inspection_requests', [
            'id' => $requestId,
            'status' => 'completed',
        ]);
    }

    public function test_requesting_an_inspection_requires_an_assignment(): void
    {
        [$organization, $inspector, , $snag] = $this->bootstrapOrg();
        Sanctum::actingAs($inspector);

        $response = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspection-requests", [
            'title' => 'Inspect it',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_viewer_without_comment_permission_cannot_record_an_inspection(): void
    {
        [$organization, , , $snag] = $this->bootstrapOrg();

        $viewer = User::factory()->create();
        $organization->users()->attach($viewer->id, ['is_active' => true]);
        setPermissionsTeamId($organization->id);
        $viewer->assignRole('viewer');
        Sanctum::actingAs($viewer);

        $response = $this->withHeaders($this->headers($organization))->postJson("/api/snags/{$snag->id}/inspections", [
            'status' => 'operational',
        ]);

        $response->assertForbidden();
    }
}
