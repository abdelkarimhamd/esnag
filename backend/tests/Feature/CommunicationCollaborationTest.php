<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\SnagEscalation;
use App\Models\SnagEscalationRule;
use App\Models\StakeholderTeam;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class CommunicationCollaborationTest extends TestCase
{
    use RefreshDatabase;

    public function test_comment_supports_mentions_watchers_threaded_replies_and_comment_attachments(): void
    {
        Storage::fake('public');

        [$organization, $project, $users] = $this->bootstrapOrganizationContext();
        $snag = $this->createSnagForProject($organization, $project, $users['project_manager'], $users['engineer']);

        $team = StakeholderTeam::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'QA Review Team',
            'is_active' => true,
        ]);
        $team->users()->attach($users['inspector']->id, [
            'organization_id' => $organization->id,
            'is_active' => true,
            'is_lead' => true,
        ]);

        Sanctum::actingAs($users['project_manager']);

        $createResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->post("/api/snags/{$snag->id}/comments", [
                'body' => sprintf('Please check this @user:%d with team @team:%d', $users['engineer']->id, $team->id),
                'mention_user_ids' => [$users['engineer']->id],
                'mention_team_ids' => [$team->id],
                'attachments' => [UploadedFile::fake()->image('comment-note.png')],
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.parent_id', null);

        $commentId = (int) $createResponse->json('data.id');
        $attachmentPath = (string) $createResponse->json('data.attachments.0.file_path');

        $this->assertDatabaseHas('snag_comment_mentions', [
            'snag_comment_id' => $commentId,
            'mentioned_user_id' => $users['engineer']->id,
        ]);
        $this->assertDatabaseHas('snag_comment_mentions', [
            'snag_comment_id' => $commentId,
            'mentioned_team_id' => $team->id,
        ]);
        $this->assertDatabaseHas('snag_comment_attachments', [
            'snag_comment_id' => $commentId,
        ]);

        Storage::disk('public')->assertExists($attachmentPath);

        $this->assertDatabaseHas('snag_watchers', [
            'snag_id' => $snag->id,
            'user_id' => $users['project_manager']->id,
        ]);
        $this->assertDatabaseHas('snag_watchers', [
            'snag_id' => $snag->id,
            'user_id' => $users['engineer']->id,
        ]);
        $this->assertDatabaseHas('snag_watchers', [
            'snag_id' => $snag->id,
            'user_id' => $users['inspector']->id,
        ]);

        $this->assertTrue(
            $users['engineer']->notifications()->get()->pluck('data.type')->contains('snag_mentioned')
        );

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/comments", [
                'body' => 'Replying on the same thread.',
                'parent_id' => $commentId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.parent_id', $commentId);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson("/api/snags/{$snag->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data.comments')
            ->assertJsonCount(1, 'data.comments.0.replies');
    }

    public function test_inspection_approval_chat_log_records_manual_and_decision_notes(): void
    {
        [$organization, $project, $users] = $this->bootstrapOrganizationContext();

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Inspection Chat Template',
            'code' => 'CHAT-TPL-001',
            'type' => 'checklist',
            'description' => 'Template for approval chat log test',
            'schema' => [
                'sections' => [
                    [
                        'title' => 'General',
                        'fields' => [
                            ['key' => 'title', 'label' => 'Title', 'type' => 'text', 'required' => true],
                        ],
                    ],
                ],
            ],
            'approval_workflow' => [
                [
                    'step_order' => 1,
                    'step_name' => 'Consultant Review',
                    'role_name' => 'inspector',
                    'requires_signature' => false,
                ],
            ],
            'is_active' => true,
            'version' => 1,
            'created_by' => $users['project_manager']->id,
        ]);

        Sanctum::actingAs($users['engineer']);

        $submissionResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/inspections/submissions', [
                'inspection_template_id' => $template->id,
                'project_id' => $project->id,
                'form_data' => ['title' => 'Inspection discussion record'],
            ])
            ->assertCreated();

        $submissionId = (int) $submissionResponse->json('data.id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/submit")
            ->assertOk();

        Sanctum::actingAs($users['inspector']);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/approval-messages", [
                'body' => 'Need one clarification before approval.',
                'message_type' => 'comment',
            ])
            ->assertCreated();

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/approve", [
                'decision' => 'approve',
                'notes' => 'All requirements are satisfied.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', InspectionSubmission::STATUS_APPROVED);

        $this->assertDatabaseHas('inspection_approval_messages', [
            'inspection_submission_id' => $submissionId,
            'message_type' => 'comment',
            'body' => 'Need one clarification before approval.',
        ]);

        $this->assertDatabaseHas('inspection_approval_messages', [
            'inspection_submission_id' => $submissionId,
            'message_type' => 'decision_approve',
            'body' => 'All requirements are satisfied.',
        ]);
    }

    public function test_overdue_escalation_rule_escalates_once_within_cooldown_window(): void
    {
        [$organization, $project, $users] = $this->bootstrapOrganizationContext();
        $snag = $this->createSnagForProject($organization, $project, $users['project_manager'], $users['engineer'], [
            'status' => SnagStatus::InProgress->value,
            'due_date' => now()->subDays(7)->toDateString(),
        ]);

        SnagEscalationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Overdue escalation for consultant and owner',
            'overdue_days' => 3,
            'escalate_to_roles' => ['consultant', 'owner'],
            'cooldown_hours' => 24,
            'is_active' => true,
            'created_by' => $users['org_admin']->id,
            'updated_by' => $users['org_admin']->id,
        ]);

        $this->artisan('snags:escalate-overdue', [
            '--organization_id' => $organization->id,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('snag_escalations', [
            'snag_id' => $snag->id,
            'escalated_to_user_id' => $users['consultant']->id,
        ]);
        $this->assertDatabaseHas('snag_escalations', [
            'snag_id' => $snag->id,
            'escalated_to_user_id' => $users['owner']->id,
        ]);

        $this->assertDatabaseHas('snag_watchers', [
            'snag_id' => $snag->id,
            'user_id' => $users['consultant']->id,
            'source' => 'escalation',
        ]);
        $this->assertDatabaseHas('snag_watchers', [
            'snag_id' => $snag->id,
            'user_id' => $users['owner']->id,
            'source' => 'escalation',
        ]);

        $this->assertTrue(
            $users['consultant']->notifications()->get()->pluck('data.type')->contains('snag_escalated')
        );
        $this->assertTrue(
            $users['owner']->notifications()->get()->pluck('data.type')->contains('snag_escalated')
        );

        $this->artisan('snags:escalate-overdue', [
            '--organization_id' => $organization->id,
        ])->assertExitCode(0);

        $this->assertSame(2, SnagEscalation::query()->where('snag_id', $snag->id)->count());
    }

    /**
     * @return array{0: Organization, 1: Project, 2: array<string, User>}
     */
    private function bootstrapOrganizationContext(): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $users = [
            'org_admin' => User::factory()->create(),
            'project_manager' => User::factory()->create(),
            'engineer' => User::factory()->create(),
            'inspector' => User::factory()->create(),
            'consultant' => User::factory()->create(),
            'owner' => User::factory()->create(),
        ];

        foreach ($users as $user) {
            $organization->users()->attach($user->id, ['is_active' => true]);
        }

        setPermissionsTeamId($organization->id);
        $users['org_admin']->assignRole('org_admin');
        $users['project_manager']->assignRole('project_manager');
        $users['engineer']->assignRole('engineer');
        $users['inspector']->assignRole('inspector');
        $users['consultant']->assignRole('consultant');
        $users['owner']->assignRole('owner');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        return [$organization, $project, $users];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createSnagForProject(
        Organization $organization,
        Project $project,
        User $creator,
        User $assignee,
        array $overrides = [],
    ): Snag {
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

        return Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'status' => SnagStatus::Assigned->value,
            'created_by' => $creator->id,
            'assigned_to' => $assignee->id,
            ...$overrides,
        ]);
    }
}

