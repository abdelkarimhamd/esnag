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
use App\Notifications\HandoverStageNotification;
use App\Services\HandoverRequestService;
use App\Services\HandoverRoutingService;
use App\Support\HandoverActions;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

/**
 * Phase 3 (item 10) — handover comments-by-stage/org thread + recorded-exception
 * closure (BR-FR-031, BR-BR-002, BR-BR-011/012, OD-12).
 */
class Phase3HandoverCommentsTest extends TestCase
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
            $this->companies[$type] = $company;
            $this->users[$type] = $user;
        }

        $this->requests = app(HandoverRequestService::class);
        $this->routing = app(HandoverRoutingService::class);
    }

    private function headers(): array
    {
        return ['X-Organization-Id' => (string) $this->org->id];
    }

    private function submittedRequest(): HandoverRequest
    {
        $request = $this->requests->create($this->users['contractor'], $this->org->id, $this->project->id, [
            'title' => 'Comment thread handover',
        ]);

        return $this->routing->submit($request, $this->users['contractor']); // stage 2, consultant party
    }

    public function test_party_can_post_a_comment_captured_by_stage_and_party(): void
    {
        Notification::fake();
        $request = $this->submittedRequest();

        Sanctum::actingAs($this->users['contractor']);
        $comment = $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/comments", [
                'body' => 'As-built drawings for level 2 are attached.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.stage_order', 2)
            ->assertJsonPath('data.cycle_number', 1)
            ->assertJsonPath('data.source_company_id', $this->companies['contractor']->id)
            ->json('data');

        $this->assertDatabaseHas('handover_comments', [
            'id' => $comment['id'],
            'handover_request_id' => $request->id,
            'user_id' => $this->users['contractor']->id,
            'is_internal' => false,
        ]);

        // A public comment notifies the party currently holding the request (consultant).
        Notification::assertSentTo($this->users['consultant'], HandoverStageNotification::class);
    }

    public function test_internal_comment_is_hidden_from_other_parties(): void
    {
        $request = $this->submittedRequest();

        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/comments", [
                'body' => 'Internal note: check the MEP coordination before we forward.',
                'is_internal' => true,
            ])->assertCreated();

        // The contractor (a different party) does not see the consultant's internal note.
        Sanctum::actingAs($this->users['contractor']);
        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$request->id}/comments")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // The consultant's own party sees it.
        Sanctum::actingAs($this->users['consultant']);
        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$request->id}/comments")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_read_only_auditor_cannot_comment_but_can_read(): void
    {
        $request = $this->submittedRequest();

        Sanctum::actingAs($this->users['contractor']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/comments", ['body' => 'Public comment.'])
            ->assertCreated();

        $auditor = User::factory()->create();
        $this->org->users()->attach($auditor->id, ['is_active' => true]);
        setPermissionsTeamId($this->org->id);
        $auditor->assignRole('auditor');
        Sanctum::actingAs($auditor);

        // Read-only: can read the public thread...
        $this->withHeaders($this->headers())
            ->getJson("/api/handovers/requests/{$request->id}/comments")
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // ...but cannot post.
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/comments", ['body' => 'Auditors should not write.'])
            ->assertForbidden();
    }

    public function test_reattaching_a_mandatory_snag_does_not_downgrade_it(): void
    {
        $request = $this->requests->create($this->users['contractor'], $this->org->id, $this->project->id, ['title' => 'No downgrade']);
        $snag = Snag::factory()->create(['organization_id' => $this->org->id, 'project_id' => $this->project->id]);

        $this->requests->attachSnags($this->users['contractor'], $request, [$snag->id], true);
        $this->assertDatabaseHas('handover_request_snags', [
            'handover_request_id' => $request->id, 'snag_id' => $snag->id, 'is_mandatory' => true,
        ]);

        // A subsequent non-mandatory re-attach must NOT downgrade it out of the close gate.
        $this->requests->attachSnags($this->users['contractor'], $request, [$snag->id], false);
        $this->assertDatabaseHas('handover_request_snags', [
            'handover_request_id' => $request->id, 'snag_id' => $snag->id, 'is_mandatory' => true,
        ]);
    }

    public function test_read_only_auditor_cannot_attach_snags_or_documents(): void
    {
        $request = $this->submittedRequest(); // stage 2, consultant

        $auditor = User::factory()->create();
        $this->org->users()->attach($auditor->id, ['is_active' => true]);
        setPermissionsTeamId($this->org->id);
        $auditor->assignRole('auditor');
        Sanctum::actingAs($auditor);

        $snag = Snag::factory()->create([
            'organization_id' => $this->org->id, 'project_id' => $this->project->id,
        ]);

        // The read-only auditor may view but must not modify the record / its close gate.
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/snags", ['snag_ids' => [$snag->id]])
            ->assertForbidden();

        // The originating party (contractor) still may.
        Sanctum::actingAs($this->users['contractor']);
        $this->withHeaders($this->headers())
            ->postJson("/api/handovers/requests/{$request->id}/snags", ['snag_ids' => [$snag->id]])
            ->assertOk();
    }

    public function test_open_mandatory_snag_blocks_close_unless_recorded_exception(): void
    {
        $request = $this->requests->create($this->users['contractor'], $this->org->id, $this->project->id, [
            'title' => 'Exception close handover',
        ]);
        $request->forceFill(['current_stage_order' => 12, 'status' => HandoverRequest::STATUS_APPROVED]);
        $this->routing->resolveStageParty($request, $request->stageNode(12));
        $request->save();

        $snag = Snag::factory()->create([
            'organization_id' => $this->org->id,
            'project_id' => $this->project->id,
            'status' => SnagStatus::InProgress->value,
        ]);
        $this->requests->attachSnags($this->users['owner'], $request, [$snag->id], true);

        // Without the exception flag, closure is blocked by the open mandatory snag.
        try {
            $this->routing->close($request->fresh(), $this->users['owner']);
            $this->fail('Closure should be blocked while a mandatory snag is open.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('closure', $exception->errors());
        }

        // The exception flag without a recorded justification is still blocked.
        try {
            $this->routing->close($request->fresh(), $this->users['owner'], ['is_exception' => true]);
            $this->fail('A reason is required for an exception close.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('reason', $exception->errors());
        }

        // With the flag and a recorded justification, it closes and records the exception.
        $closed = $this->routing->close($request->fresh(), $this->users['owner'], [
            'is_exception' => true,
            'reason' => 'Owner-approved exception: cosmetic snag deferred to the DLP.',
        ]);
        $this->assertSame(HandoverRequest::STATUS_CLOSED, $closed->status);

        $event = HandoverEvent::query()
            ->where('handover_request_id', $request->id)
            ->where('action', HandoverActions::CLOSE)
            ->firstOrFail();
        $this->assertSame('Owner-approved exception: cosmetic snag deferred to the DLP.', $event->reason);
        $this->assertTrue((bool) ($event->metadata['is_exception'] ?? false));
        $this->assertSame(1, $event->metadata['open_mandatory_at_close'] ?? null);
    }
}
