<?php

namespace Tests\Feature;

use App\Models\InspectionRequest;
use App\Models\InspectionSignature;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class InspectionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_approval_step_enforces_role_and_signature_before_approval(): void
    {
        Storage::fake('public');

        [$organization, $project, $users] = $this->bootstrapInspectionContext();

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'NCR Signature Workflow',
            'code' => 'NCR-SIGN-001',
            'type' => 'ncr',
            'description' => 'Signature enforcement workflow',
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
                    'step_name' => 'Inspector Signature',
                    'role_name' => 'inspector',
                    'requires_signature' => true,
                ],
            ],
            'is_active' => true,
            'version' => 1,
            'created_by' => $users['project_manager']->id,
        ]);

        Sanctum::actingAs($users['engineer']);

        $createResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/inspections/submissions', [
                'inspection_template_id' => $template->id,
                'project_id' => $project->id,
                'form_data' => ['title' => 'Crack observed at slab edge'],
            ]);

        $createResponse->assertCreated()->assertJsonPath('data.status', InspectionSubmission::STATUS_DRAFT);
        $submissionId = (int) $createResponse->json('data.id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', InspectionSubmission::STATUS_SUBMITTED);

        Sanctum::actingAs($users['project_manager']);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/approve", [
                'decision' => 'approve',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.approval.0', 'You are not authorized to act on the current approval step.');

        Sanctum::actingAs($users['inspector']);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/approve", [
                'decision' => 'approve',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.signature.0', 'Digital signature is required before approving this step.');

        $tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAEAQH/cetR9QAAAABJRU5ErkJggg==';

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/inspections/submissions/{$submissionId}/signatures", [
                'signature_data' => $tinyPngDataUrl,
                'context' => 'approval_step',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', InspectionSubmission::STATUS_APPROVED);

        $signature = InspectionSignature::query()->where('inspection_submission_id', $submissionId)->firstOrFail();

        $this->assertDatabaseHas('inspection_approvals', [
            'inspection_submission_id' => $submissionId,
            'status' => 'approved',
            'approver_id' => $users['inspector']->id,
        ]);

        $this->assertDatabaseHas('inspection_submissions', [
            'id' => $submissionId,
            'status' => InspectionSubmission::STATUS_APPROVED,
        ]);

        Storage::disk('public')->assertExists($signature->file_path);
    }

    public function test_inspection_requests_can_be_created_scheduled_and_completed_with_membership_guard(): void
    {
        [$organization, $project, $users] = $this->bootstrapInspectionContext();

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'name' => 'WIR Core',
            'code' => 'WIR-CORE-001',
            'type' => 'wir',
            'description' => 'Core WIR template',
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

        $submission = InspectionSubmission::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'inspection_template_id' => $template->id,
            'reference' => 'INSP-00001',
            'status' => InspectionSubmission::STATUS_APPROVED,
            'form_data' => ['scope' => 'Slab reinforcement check'],
            'current_approval_order' => null,
            'created_by' => $users['engineer']->id,
            'submitted_by' => $users['engineer']->id,
            'submitted_at' => Carbon::now()->subDays(2),
            'approved_at' => Carbon::now()->subDay(),
            'rejected_at' => null,
            'last_updated_by' => $users['engineer']->id,
        ]);

        Sanctum::actingAs($users['engineer']);

        $createResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/inspections/requests', [
                'project_id' => $project->id,
                'inspection_submission_id' => $submission->id,
                'request_type' => 'mir',
                'title' => 'MIR - Cement approval',
                'description' => 'Request approval for material batch CM-102',
                'assigned_to' => $users['inspector']->id,
                'scheduled_for' => Carbon::now()->addDay()->toDateTimeString(),
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.request_type', 'mir')
            ->assertJsonPath('data.status', InspectionRequest::STATUS_SCHEDULED);

        $requestId = (int) $createResponse->json('data.id');

        $outsideUser = User::factory()->create();

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->putJson("/api/inspections/requests/{$requestId}", [
                'assigned_to' => $outsideUser->id,
            ])
            ->assertStatus(422);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->putJson("/api/inspections/requests/{$requestId}", [
                'status' => InspectionRequest::STATUS_COMPLETED,
                'description' => 'Inspection completed and closed',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', InspectionRequest::STATUS_COMPLETED);

        $requestModel = InspectionRequest::query()->findOrFail($requestId);
        $this->assertNotNull($requestModel->completed_at);
        $this->assertSame($submission->id, $requestModel->inspection_submission_id);
    }

    /**
     * @return array{0: Organization, 1: Project, 2: array<string, User>}
     */
    private function bootstrapInspectionContext(): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $users = [
            'org_admin' => User::factory()->create(),
            'project_manager' => User::factory()->create(),
            'engineer' => User::factory()->create(),
            'inspector' => User::factory()->create(),
        ];

        foreach ($users as $user) {
            $organization->users()->attach($user->id, ['is_active' => true]);
        }

        setPermissionsTeamId($organization->id);
        $users['org_admin']->assignRole('org_admin');
        $users['project_manager']->assignRole('project_manager');
        $users['engineer']->assignRole('engineer');
        $users['inspector']->assignRole('inspector');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        return [$organization, $project, $users];
    }
}

