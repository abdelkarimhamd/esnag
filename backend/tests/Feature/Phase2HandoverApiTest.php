<?php

namespace Tests\Feature;

use App\Models\HandoverRequest;
use App\Models\Organization;
use App\Models\Project;
use App\Models\StakeholderCompany;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * Phase 2 — HTTP surface for the handover routing engine (/handovers/*).
 */
class Phase2HandoverApiTest extends TestCase
{
    use RefreshDatabase;

    private const TYPE_TO_ROLE = [
        'contractor' => 'contractor_submitter',
        'consultant' => 'consultant_reviewer',
        'authority' => 'authority_reviewer',
        'owner' => 'owner_reviewer',
        'fmmp' => 'fmmp_coordinator',
        'service_provider' => 'service_provider_inspector',
    ];

    private Organization $org;
    private Project $project;
    /** @var array<string, User> */
    private array $users = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($this->org);
        $this->project = Project::factory()->create(['organization_id' => $this->org->id]);
        setPermissionsTeamId($this->org->id);

        foreach (self::TYPE_TO_ROLE as $type => $role) {
            $company = StakeholderCompany::factory()->create([
                'organization_id' => $this->org->id, 'type' => $type, 'is_active' => true,
            ]);
            $user = User::factory()->create();
            $this->org->users()->attach($user->id, ['is_active' => true]);
            DB::table('company_user')->insert([
                'organization_id' => $this->org->id, 'company_id' => $company->id, 'user_id' => $user->id,
                'is_active' => true, 'is_primary' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $user->assignRole($role);
            $this->users[$type] = $user;
        }
    }

    private function headers(): array
    {
        return ['X-Organization-Id' => (string) $this->org->id];
    }

    public function test_workflow_resolve_returns_the_twelve_stage_default(): void
    {
        Sanctum::actingAs($this->users['fmmp']);

        $this->withHeaders($this->headers())
            ->getJson('/api/handovers/workflows/resolve?project_id='.$this->project->id)
            ->assertOk()
            ->assertJsonCount(12, 'data.stages');
    }

    public function test_create_submit_forward_flow_over_http(): void
    {
        // Contractor creates a request.
        Sanctum::actingAs($this->users['contractor']);
        $created = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id,
                'title' => 'Energy centre handover',
            ])
            ->assertCreated()
            ->assertJsonPath('data.reference', 'HR-00001')
            ->assertJsonPath('data.status', 'draft')
            ->json('data');

        $id = $created['id'];

        // Contractor submits -> routes to the consultant (stage 2).
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/submit")
            ->assertOk()
            ->assertJsonPath('data.current_stage_order', 2)
            ->assertJsonPath('data.status', 'in_progress');

        // Consultant forwards -> stage 3.
        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/act", ['action' => 'forward'])
            ->assertOk()
            ->assertJsonPath('data.current_stage_order', 3);

        // Summary reflects the current stage.
        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$id}/summary")
            ->assertOk()
            ->assertJsonPath('data.current_stage_order', 3)
            ->assertJsonPath('data.current_stage_key', 'authority_review');
    }

    public function test_wrong_party_actor_gets_403(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id,
                'title' => 'Gated handover',
            ])->json('data.id');

        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        // The authority is not the current-stage (consultant) party.
        Sanctum::actingAs($this->users['authority']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/act", ['action' => 'forward'])
            ->assertForbidden();
    }

    public function test_return_without_reason_is_rejected(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Return test',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/act", ['action' => 'return'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);
    }

    public function test_admin_can_save_a_project_workflow_override(): void
    {
        $admin = User::factory()->create();
        $this->org->users()->attach($admin->id, ['is_active' => true]);
        setPermissionsTeamId($this->org->id);
        $admin->assignRole('system_administrator');
        Sanctum::actingAs($admin);

        $stages = [
            ['stage_order' => 1, 'stage_key' => 'submit', 'name' => 'Contractor submit', 'responsible_type' => 'contractor', 'permitted_actions' => ['submit', 'forward'], 'forward_to_stage' => 2],
            ['stage_order' => 2, 'stage_key' => 'accept', 'name' => 'Owner accept', 'responsible_type' => 'owner', 'permitted_actions' => ['approve', 'close'], 'is_final_authority' => true],
        ];

        $this->withHeaders($this->headers())
            ->postJson('/api/handovers/workflows', [
                'project_id' => $this->project->id,
                'name' => 'Fast-track handover',
                'stages' => $stages,
            ])
            ->assertCreated()
            ->assertJsonCount(2, 'data.stages');

        // A new request in the project now freezes the 2-stage override.
        Sanctum::actingAs($this->users['contractor']);
        $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', ['project_id' => $this->project->id, 'title' => 'Override test'])
            ->assertCreated()
            ->assertJsonCount(2, 'data.stage_graph_snapshot');
    }

    public function test_non_admin_cannot_configure_workflow(): void
    {
        // consultant_reviewer does not hold workflow.configure.
        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())
            ->postJson('/api/handovers/workflows', [
                'name' => 'Nope',
                'stages' => [
                    ['stage_order' => 1, 'stage_key' => 'a', 'name' => 'A', 'responsible_type' => 'owner', 'permitted_actions' => ['close'], 'is_final_authority' => true],
                ],
            ])
            ->assertForbidden();
    }

    public function test_audit_trail_exports_as_csv(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', ['project_id' => $this->project->id, 'title' => 'Export me'])
            ->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();
        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/act", ['action' => 'forward'])->assertOk();

        Sanctum::actingAs($this->users['owner']); // any authorised viewer may export the evidence
        $response = $this->withHeaders($this->headers())->get("/api/handovers/requests/{$id}/audit-export");

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('content-type'));

        $csv = $response->streamedContent();
        $this->assertStringContainsString('HR-00001', $csv);
        $this->assertStringContainsString('create', $csv);
        $this->assertStringContainsString('submit', $csv);
        $this->assertStringContainsString('forward', $csv);
        $this->assertStringContainsString('Reference,Cycle', $csv);
    }

    public function test_originating_party_can_cancel_a_submitted_request(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Cancel me',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        // The contractor is now the originating party; the request sits with the consultant.
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/cancel", ['reason' => 'Client paused the scope'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.current_stage_order', null);

        $this->assertDatabaseHas('handover_events', [
            'handover_request_id' => $id,
            'action' => 'cancel',
            'reason' => 'Client paused the scope',
        ]);
    }

    public function test_cancel_requires_a_reason(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'No reason cancel',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/cancel", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);
    }

    public function test_unauthorised_party_cannot_cancel(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Guard cancel',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        // The authority is neither the responsible (consultant) nor the originating (contractor) party.
        Sanctum::actingAs($this->users['authority']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$id}/cancel", ['reason' => 'Trying to cancel'])
            ->assertForbidden();
    }

    public function test_a_submitted_request_cannot_be_deleted(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Undeletable',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        $model = HandoverRequest::query()->findOrFail($id);
        try {
            $model->delete();
            $this->fail('A submitted handover request must not be deletable.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('cannot be deleted', $exception->getMessage());
        }

        $this->assertDatabaseHas('handover_requests', ['id' => $id]);
    }

    public function test_a_draft_request_can_still_be_deleted(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Deletable draft',
            ])->json('data.id');

        HandoverRequest::query()->findOrFail($id)->delete();

        $this->assertDatabaseMissing('handover_requests', ['id' => $id]);
    }

    public function test_events_stream_is_readable(): void
    {
        Sanctum::actingAs($this->users['contractor']);
        $id = $this->withHeaders($this->headers())
            ->postJson('/api/handovers/requests', [
                'project_id' => $this->project->id, 'title' => 'Audit test',
            ])->json('data.id');
        $this->withHeaders($this->headers())->postJson("/api/handovers/requests/{$id}/submit")->assertOk();

        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$id}/events")
            ->assertOk()
            ->assertJsonPath('data.0.action', 'create');
    }
}
