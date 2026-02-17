<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\SnagReminderLog;
use App\Models\SnagReminderPolicy;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Models\WorkflowAutomationRule;
use App\Notifications\SnagReminderNotification;
use App\Notifications\SnagWorkflowEscalatedNotification;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class WorkflowAutomationTest extends TestCase
{
    use RefreshDatabase;

    public function test_high_priority_electrical_rule_assigns_team_and_due_date(): void
    {
        [$organization, $project, $users, $drawing] = $this->bootstrapContext();

        $company = StakeholderCompany::query()->create([
            'organization_id' => $organization->id,
            'name' => 'Electrical Contractor',
            'type' => 'contractor',
            'is_active' => true,
        ]);

        $team = StakeholderTeam::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'company_id' => $company->id,
            'name' => 'Team A',
            'is_active' => true,
        ]);

        WorkflowAutomationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Electrical high priority assignment',
            'trigger_event' => WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
            'conditions' => [
                'trade' => ['Electrical'],
                'priority' => ['high'],
            ],
            'actions' => [
                'assign_team_id' => $team->id,
                'assign_company_id' => $company->id,
                'due_in_hours' => 48,
            ],
            'priority' => 10,
            'run_once_per_snag' => false,
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
            'updated_by' => $users['project_manager']->id,
        ]);

        Sanctum::actingAs($users['project_manager']);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/snags', [
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'title' => 'Panel board issue',
                'priority' => 'high',
                'trade' => 'Electrical',
                'pin_x' => 0.5,
                'pin_y' => 0.5,
            ])
            ->assertCreated()
            ->assertJsonPath('data.assigned_team_id', $team->id)
            ->assertJsonPath('data.assigned_company_id', $company->id)
            ->assertJsonPath('data.status', SnagStatus::Assigned->value);

        $snagId = (int) $response->json('data.id');

        $this->assertDatabaseHas('snags', [
            'id' => $snagId,
            'assigned_team_id' => $team->id,
            'assigned_company_id' => $company->id,
        ]);

        $snag = Snag::query()->findOrFail($snagId);
        $this->assertSame(now()->addHours(48)->toDateString(), $snag->due_date?->toDateString());

        $this->assertDatabaseHas('workflow_automation_logs', [
            'snag_id' => $snagId,
            'result' => 'applied',
            'trigger_event' => WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
        ]);
    }

    public function test_rejected_twice_rule_escalates_to_consultant_and_owner(): void
    {
        Notification::fake();

        [$organization, $project, $users, $drawing] = $this->bootstrapContext();

        $consultant = User::factory()->create();
        $owner = User::factory()->create();
        $organization->users()->attach($consultant->id, ['is_active' => true]);
        $organization->users()->attach($owner->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $consultant->assignRole('consultant');
        $owner->assignRole('owner');

        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'status' => SnagStatus::Assigned->value,
            'trade' => 'Electrical',
            'created_by' => $users['project_manager']->id,
            'assigned_to' => $users['engineer']->id,
        ]);

        WorkflowAutomationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Rejected twice escalation',
            'trigger_event' => WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED,
            'conditions' => [
                'status' => [SnagStatus::Rejected->value],
                'status_changed_to' => [SnagStatus::Rejected->value],
                'rejection_count_gte' => 2,
            ],
            'actions' => [
                'escalate_to_roles' => ['consultant', 'owner'],
            ],
            'priority' => 20,
            'run_once_per_snag' => true,
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
            'updated_by' => $users['project_manager']->id,
        ]);

        Sanctum::actingAs($users['project_manager']);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Rejected->value,
            ])
            ->assertOk();

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Assigned->value,
                'assigned_to' => $users['engineer']->id,
            ])
            ->assertOk();

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/snags/{$snag->id}/transition", [
                'to_status' => SnagStatus::Rejected->value,
            ])
            ->assertOk();

        Notification::assertSentTo($consultant, SnagWorkflowEscalatedNotification::class);
        Notification::assertSentTo($owner, SnagWorkflowEscalatedNotification::class);

        $this->assertSame(
            1,
            \App\Models\WorkflowAutomationLog::query()
                ->where('snag_id', $snag->id)
                ->where('result', 'applied')
                ->count()
        );
    }

    public function test_reminder_command_respects_interval_and_max_reminders(): void
    {
        Notification::fake();

        [$organization, $project, $users, $drawing] = $this->bootstrapContext();

        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'status' => SnagStatus::Assigned->value,
            'created_by' => $users['project_manager']->id,
            'assigned_to' => $users['engineer']->id,
        ]);

        SnagReminderPolicy::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Assigned reminder',
            'statuses' => [SnagStatus::Assigned->value],
            'reminder_every_hours' => 12,
            'max_reminders' => 2,
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
            'updated_by' => $users['project_manager']->id,
        ]);

        $this->artisan('snags:send-reminders', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->assertDatabaseHas('snag_reminder_logs', [
            'snag_id' => $snag->id,
            'user_id' => $users['engineer']->id,
            'reminder_count' => 1,
        ]);

        $this->artisan('snags:send-reminders', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->assertSame(1, SnagReminderLog::query()->where('snag_id', $snag->id)->count());

        $this->travel(13)->hours();

        $this->artisan('snags:send-reminders', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->travel(13)->hours();

        $this->artisan('snags:send-reminders', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->assertSame(2, SnagReminderLog::query()->where('snag_id', $snag->id)->count());
        Notification::assertSentToTimes($users['engineer'], SnagReminderNotification::class, 2);
    }

    public function test_recurring_schedule_command_generates_submission_and_updates_next_run(): void
    {
        [$organization, $project, $users] = $this->bootstrapContext(withDrawing: false);

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'Recurring MIR Template',
            'code' => 'MIR-REC-001',
            'type' => 'mir',
            'description' => 'Recurring MIR template',
            'schema' => [
                'sections' => [
                    [
                        'title' => 'General',
                        'fields' => [
                            ['key' => 'scope', 'label' => 'Scope', 'type' => 'text', 'required' => true],
                        ],
                    ],
                ],
            ],
            'approval_workflow' => null,
            'is_active' => true,
            'version' => 1,
            'created_by' => $users['project_manager']->id,
        ]);

        $schedule = InspectionRecurringSchedule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'inspection_template_id' => $template->id,
            'name' => 'Weekly MIR schedule',
            'recurrence' => InspectionRecurringSchedule::RECURRENCE_WEEKLY,
            'interval_value' => 1,
            'starts_at' => now()->subDays(15),
            'next_run_at' => now()->subMinutes(10),
            'run_time' => '08:00',
            'timezone' => 'UTC',
            'default_form_data' => ['auto' => true],
            'assign_to_user_id' => $users['engineer']->id,
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
            'updated_by' => $users['project_manager']->id,
        ]);

        $this->artisan('inspections:generate-recurring', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->assertDatabaseHas('inspection_submissions', [
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'inspection_template_id' => $template->id,
            'status' => InspectionSubmission::STATUS_DRAFT,
        ]);

        $this->assertDatabaseHas('inspection_recurring_runs', [
            'inspection_recurring_schedule_id' => $schedule->id,
            'status' => 'generated',
        ]);

        $updatedSchedule = InspectionRecurringSchedule::query()->findOrFail($schedule->id);
        $this->assertTrue($updatedSchedule->next_run_at->greaterThan(now()));

        $this->artisan('inspections:generate-recurring', ['--organization_id' => $organization->id])
            ->assertExitCode(0);

        $this->assertSame(
            1,
            InspectionSubmission::query()
                ->where('organization_id', $organization->id)
                ->where('inspection_template_id', $template->id)
                ->count()
        );
    }

    /**
     * @return array{0: Organization, 1: Project, 2: array<string, User>, 3: Drawing|null}
     */
    private function bootstrapContext(bool $withDrawing = true): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $users = [
            'project_manager' => User::factory()->create(),
            'engineer' => User::factory()->create(),
        ];

        foreach ($users as $user) {
            $organization->users()->attach($user->id, ['is_active' => true]);
        }

        setPermissionsTeamId($organization->id);
        $users['project_manager']->assignRole('project_manager');
        $users['engineer']->assignRole('engineer');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        if (! $withDrawing) {
            return [$organization, $project, $users, null];
        }

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

        return [$organization, $project, $users, $drawing];
    }
}
