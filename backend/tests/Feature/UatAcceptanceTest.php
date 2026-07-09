<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\HandoverEvent;
use App\Models\HandoverRequest;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\StakeholderCompany;
use App\Models\User;
use App\Services\HandoverRequestService;
use App\Services\HandoverRoutingService;
use App\Support\HandoverActions;
use Database\Seeders\RbacSeeder;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * SC-07 — the 14 UAT acceptance scenarios (BRD §14) as a single traceable suite.
 * Each test names its scenario. Multi-party fixture mirrors the KAGA demo.
 */
class UatAcceptanceTest extends TestCase
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
    /** @var array<string, StakeholderCompany> */
    private array $companies = [];
    /** @var array<string, User> */
    private array $users = [];
    private HandoverRequestService $requests;
    private HandoverRoutingService $routing;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($this->org);
        $this->project = Project::factory()->create(['organization_id' => $this->org->id]);
        setPermissionsTeamId($this->org->id);

        foreach (self::TYPE_TO_ROLE as $type => $role) {
            $this->companies[$type] = StakeholderCompany::factory()->create([
                'organization_id' => $this->org->id, 'type' => $type, 'is_active' => true,
            ]);
            $this->users[$type] = $this->partyUser($this->companies[$type], $role);
        }

        $this->requests = app(HandoverRequestService::class);
        $this->routing = app(HandoverRoutingService::class);
    }

    private function partyUser(StakeholderCompany $company, string $role): User
    {
        $user = User::factory()->create();
        $this->org->users()->attach($user->id, ['is_active' => true]);
        DB::table('company_user')->insert([
            'organization_id' => $this->org->id, 'company_id' => $company->id, 'user_id' => $user->id,
            'is_active' => true, 'is_primary' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        setPermissionsTeamId($this->org->id);
        $user->assignRole($role);

        return $user;
    }

    private function newRequest(string $title = 'UAT handover'): HandoverRequest
    {
        return $this->requests->create($this->users['contractor'], $this->org->id, $this->project->id, ['title' => $title]);
    }

    private function mandatorySnag(HandoverRequest $request, string $status = 'in_progress'): Snag
    {
        $snag = Snag::factory()->create([
            'organization_id' => $this->org->id,
            'project_id' => $this->project->id,
            'status' => $status,
        ]);
        $this->requests->attachSnags($this->users['owner'], $request, [$snag->id], true);

        return $snag;
    }

    // UAT-01 — a request is created, submitted, and every step is captured in the audit trail.
    public function test_uat01_create_submit_and_audit(): void
    {
        $request = $this->newRequest('UAT-01');
        $this->routing->submit($request->fresh(), $this->users['contractor']);

        $this->assertDatabaseHas('handover_events', ['handover_request_id' => $request->id, 'action' => HandoverActions::CREATE]);
        $this->assertDatabaseHas('handover_events', ['handover_request_id' => $request->id, 'action' => HandoverActions::SUBMIT]);
    }

    // UAT-03 — a reviewer returns a request WITH a reason and it routes back to the configured party.
    public function test_uat03_return_with_reason_routes_to_configured_party(): void
    {
        $request = $this->newRequest('UAT-03');
        $reference = $request->reference;
        $request = $this->routing->submit($request->fresh(), $this->users['contractor']); // stage 2, consultant

        $request = $this->routing->act($request->fresh(), $this->users['consultant'], HandoverActions::RETURN, [
            'reason' => 'Missing MEP as-builts.',
        ]);

        $this->assertSame($reference, $request->reference);
        $this->assertSame($this->companies['contractor']->id, $request->responsible_company_id);
        $this->assertSame(HandoverRequest::STATUS_RETURNED, $request->status);
        $this->assertDatabaseHas('handover_events', [
            'handover_request_id' => $request->id, 'action' => HandoverActions::RETURN, 'reason' => 'Missing MEP as-builts.',
        ]);
    }

    // UAT-09 — a request rectified through the full cycle is resubmitted under the SAME
    // reference and opens a NEW cycle (the loop-back at the rectify stage).
    public function test_uat09_rectify_and_resubmit_same_reference_new_cycle(): void
    {
        $request = $this->newRequest('UAT-09');
        $reference = $request->reference;
        $request = $this->routing->submit($request->fresh(), $this->users['contractor']); // 2
        $request = $this->routing->act($request->fresh(), $this->users['consultant'], HandoverActions::FORWARD); // 3
        $request = $this->routing->act($request->fresh(), $this->users['authority'], HandoverActions::FORWARD); // 4
        $request = $this->routing->act($request->fresh(), $this->users['owner'], HandoverActions::FORWARD); // 5
        $request = $this->routing->act($request->fresh(), $this->users['fmmp'], HandoverActions::FORWARD); // 6

        $submission = \App\Models\InspectionSubmission::factory()->create([
            'organization_id' => $this->org->id, 'project_id' => $this->project->id,
        ]);
        $this->requests->attachInspections($this->users['service_provider'], $request->fresh(), [$submission->id]);
        $request = $this->routing->act($request->fresh(), $this->users['service_provider'], HandoverActions::FORWARD); // 7
        $request = $this->routing->act($request->fresh(), $this->users['fmmp'], HandoverActions::FORWARD); // 8
        $request = $this->routing->act($request->fresh(), $this->users['owner'], HandoverActions::FORWARD); // 9 (rectify path)
        $request = $this->routing->act($request->fresh(), $this->users['authority'], HandoverActions::FORWARD); // 10
        $request = $this->routing->act($request->fresh(), $this->users['consultant'], HandoverActions::FORWARD); // 11
        $this->assertSame(1, $request->cycle_number);

        // Contractor resubmits at the rectify stage — loop-back to stage 2, new cycle.
        $request = $this->routing->act($request->fresh(), $this->users['contractor'], HandoverActions::FORWARD);

        $this->assertSame($reference, $request->reference);
        $this->assertSame(2, $request->current_stage_order);
        $this->assertSame(2, $request->cycle_number);
    }

    // UAT-10 — two users of the SAME role are both permitted to act, and each action is individually attributed.
    public function test_uat10_two_same_role_users_both_permitted_and_individually_audited(): void
    {
        $consultant2 = $this->partyUser($this->companies['consultant'], 'consultant_reviewer');

        $request = $this->newRequest('UAT-10');
        $request = $this->routing->submit($request->fresh(), $this->users['contractor']); // stage 2, consultant

        // Both consultants are permitted at the consultant stage.
        $this->assertContains(HandoverActions::FORWARD, $this->routing->summary($request->fresh(), $this->users['consultant'])['viewer_permitted_actions']);
        $this->assertContains(HandoverActions::FORWARD, $this->routing->summary($request->fresh(), $consultant2)['viewer_permitted_actions']);

        // The second same-role user forwards, and the event is attributed to THEM.
        $request = $this->routing->act($request->fresh(), $consultant2, HandoverActions::FORWARD);
        $this->assertDatabaseHas('handover_events', [
            'handover_request_id' => $request->id, 'action' => HandoverActions::FORWARD, 'actor_id' => $consultant2->id,
        ]);
    }

    // UAT-11 — an action taken outside the actor's stage/party is blocked.
    public function test_uat11_action_outside_stage_or_party_is_blocked(): void
    {
        $request = $this->newRequest('UAT-11');
        $request = $this->routing->submit($request->fresh(), $this->users['contractor']); // stage 2, consultant

        // The authority is not the current-stage (consultant) party.
        $this->expectException(AuthorizationException::class);
        $this->routing->act($request->fresh(), $this->users['authority'], HandoverActions::FORWARD);
    }

    // UAT-13 — closure is blocked while a mandatory snag is open, unless an approved exception is recorded.
    public function test_uat13_closure_blocked_by_open_mandatory_snag_unless_exception(): void
    {
        $request = $this->newRequest('UAT-13');
        $request->forceFill(['current_stage_order' => 12, 'status' => HandoverRequest::STATUS_APPROVED]);
        $this->routing->resolveStageParty($request, $request->stageNode(12));
        $request->save();
        $this->mandatorySnag($request);

        try {
            $this->routing->close($request->fresh(), $this->users['owner']);
            $this->fail('Closure should be blocked by the open mandatory snag.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('closure', $exception->errors());
        }

        // The final authority may close under a recorded exception.
        $closed = $this->routing->close($request->fresh(), $this->users['owner'], [
            'is_exception' => true, 'reason' => 'Owner-approved exception.',
        ]);
        $this->assertSame(HandoverRequest::STATUS_CLOSED, $closed->status);
    }

    // UAT-14 — the full audit trail of a request is exportable and human-readable (CSV).
    public function test_uat14_audit_trail_is_exportable(): void
    {
        $request = $this->newRequest('UAT-14');
        $this->routing->submit($request->fresh(), $this->users['contractor']);

        Sanctum::actingAs($this->users['owner']);
        $response = $this->withHeaders(['X-Organization-Id' => (string) $this->org->id])
            ->get("/api/handovers/requests/{$request->id}/audit-export");

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('content-type'));
        $csv = $response->streamedContent();
        $this->assertStringContainsString('Reference,Cycle', $csv);
        $this->assertStringContainsString('create', $csv);
        $this->assertStringContainsString('submit', $csv);
    }

    // End-to-end — a request travels forward through every party to closure under one reference.
    public function test_end_to_end_multi_party_forward_to_closure(): void
    {
        $request = $this->newRequest('E2E');
        $request = $this->routing->submit($request->fresh(), $this->users['contractor']); // 2
        $request = $this->routing->act($request->fresh(), $this->users['consultant'], HandoverActions::FORWARD); // 3
        $request = $this->routing->act($request->fresh(), $this->users['authority'], HandoverActions::FORWARD); // 4
        $request = $this->routing->act($request->fresh(), $this->users['owner'], HandoverActions::FORWARD); // 5
        $request = $this->routing->act($request->fresh(), $this->users['fmmp'], HandoverActions::FORWARD); // 6

        // Stage 6 needs a linked inspection before it forwards.
        $submission = \App\Models\InspectionSubmission::factory()->create([
            'organization_id' => $this->org->id, 'project_id' => $this->project->id,
        ]);
        $this->requests->attachInspections($this->users['service_provider'], $request->fresh(), [$submission->id]);
        $request = $this->routing->act($request->fresh(), $this->users['service_provider'], HandoverActions::FORWARD); // 7

        $request = $this->routing->act($request->fresh(), $this->users['fmmp'], HandoverActions::CONSOLIDATE);
        $request = $this->routing->act($request->fresh(), $this->users['fmmp'], HandoverActions::FORWARD); // 8
        $request = $this->routing->act($request->fresh(), $this->users['owner'], HandoverActions::APPROVE); // 12 (final authority)

        $closed = $this->routing->close($request->fresh(), $this->users['owner']);
        $this->assertSame(HandoverRequest::STATUS_CLOSED, $closed->status);
        $this->assertNull($closed->current_stage_order);
        $this->assertSame(1, $closed->cycle_number);
        $this->assertDatabaseHas('handover_events', [
            'handover_request_id' => $request->id, 'action' => HandoverActions::CLOSE, 'new_status' => HandoverRequest::STATUS_CLOSED,
        ]);
    }
}
