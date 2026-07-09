<?php

namespace Tests\Feature;

use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
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
 * Phase 3 (item 8) — inspection multi-contributor attribution, post-submit lock,
 * and configurable observation fields (BR-BR-002/017, BR-FR-037 / OD-08).
 */
class Phase3InspectionAttributionTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Project $project;
    private User $owner;
    private User $sp;
    private StakeholderCompany $spCompany;
    private User $contractor;
    private StakeholderCompany $contractorCompany;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::factory()->create();
        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($this->org);
        $this->project = Project::factory()->create(['organization_id' => $this->org->id]);
        setPermissionsTeamId($this->org->id);

        $this->owner = $this->member('owner');
        [$this->sp, $this->spCompany] = $this->partyMember('service_provider', 'service_provider_inspector');
        [$this->contractor, $this->contractorCompany] = $this->partyMember('contractor', 'contractor_submitter');
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->org->users()->attach($user->id, ['is_active' => true]);
        setPermissionsTeamId($this->org->id);
        $user->assignRole($role);

        return $user;
    }

    /**
     * @return array{0: User, 1: StakeholderCompany}
     */
    private function partyMember(string $type, string $role): array
    {
        $company = StakeholderCompany::factory()->create([
            'organization_id' => $this->org->id, 'type' => $type, 'is_active' => true,
        ]);
        $user = $this->member($role);
        DB::table('company_user')->insert([
            'organization_id' => $this->org->id, 'company_id' => $company->id, 'user_id' => $user->id,
            'is_active' => true, 'is_primary' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return [$user, $company];
    }

    private function headers(): array
    {
        return ['X-Organization-Id' => (string) $this->org->id];
    }

    private function template(): InspectionTemplate
    {
        return InspectionTemplate::factory()->create([
            'organization_id' => $this->org->id,
            'project_id' => $this->project->id,
        ]);
    }

    public function test_multiple_parties_are_individually_attributed(): void
    {
        $template = $this->template();

        // The service provider authors the first observation.
        Sanctum::actingAs($this->sp);
        $submissionId = $this->withHeaders($this->headers())
            ->postJson('/api/inspections/submissions', [
                'inspection_template_id' => $template->id,
                'project_id' => $this->project->id,
                'form_data' => ['valve_test' => 'pass'],
            ])->assertCreated()->json('data.id');

        // The contractor adds a different observation to the same submission.
        Sanctum::actingAs($this->contractor);
        $this->withHeaders($this->headers())
            ->putJson("/api/inspections/submissions/{$submissionId}", [
                'form_data' => ['pressure_reading' => '4.2 bar'],
            ])->assertOk();

        // Both observations are preserved (merge, not overwrite)...
        $submission = InspectionSubmission::query()->findOrFail($submissionId);
        $this->assertSame('pass', $submission->form_data['valve_test']);
        $this->assertSame('4.2 bar', $submission->form_data['pressure_reading']);

        // ...and each is attributed to its author and party.
        $this->assertDatabaseHas('inspection_contributions', [
            'inspection_submission_id' => $submissionId,
            'user_id' => $this->sp->id,
            'stakeholder_company_id' => $this->spCompany->id,
            'field_key' => 'valve_test',
        ]);
        $this->assertDatabaseHas('inspection_contributions', [
            'inspection_submission_id' => $submissionId,
            'user_id' => $this->contractor->id,
            'stakeholder_company_id' => $this->contractorCompany->id,
            'field_key' => 'pressure_reading',
        ]);

        // show() surfaces the contributor identities.
        Sanctum::actingAs($this->owner);
        $this->withHeaders($this->headers())
            ->getJson("/api/inspections/submissions/{$submissionId}")
            ->assertOk()
            ->assertJsonCount(2, 'data.contributions');
    }

    public function test_submitted_inspection_in_review_is_locked_to_the_inspecting_team(): void
    {
        $template = $this->template();

        Sanctum::actingAs($this->sp);
        $submissionId = $this->withHeaders($this->headers())
            ->postJson('/api/inspections/submissions', [
                'inspection_template_id' => $template->id,
                'project_id' => $this->project->id,
                'form_data' => ['valve_test' => 'pass'],
            ])->assertCreated()->json('data.id');

        InspectionSubmission::query()->whereKey($submissionId)
            ->update(['status' => InspectionSubmission::STATUS_IN_REVIEW]);

        // The inspecting team (submissions.update, no review right) is locked out.
        Sanctum::actingAs($this->sp);
        $this->withHeaders($this->headers())
            ->putJson("/api/inspections/submissions/{$submissionId}", ['form_data' => ['valve_test' => 'fail']])
            ->assertForbidden();

        // A reviewer/administrator may still edit during review.
        Sanctum::actingAs($this->owner);
        $this->withHeaders($this->headers())
            ->putJson("/api/inspections/submissions/{$submissionId}", ['form_data' => ['reviewer_note' => 'checked']])
            ->assertOk();
    }

    public function test_template_stores_configurable_observation_fields(): void
    {
        Sanctum::actingAs($this->owner);

        $template = $this->withHeaders($this->headers())
            ->postJson('/api/inspections/templates', [
                'name' => 'FMMP Observation Set',
                'type' => 'commissioning',
                'schema' => [
                    'sections' => [
                        ['title' => 'General', 'fields' => [
                            ['key' => 'result', 'label' => 'Result', 'type' => 'select'],
                        ]],
                    ],
                ],
                'observation_fields' => [
                    ['key' => 'ambient_temp', 'label' => 'Ambient temperature', 'type' => 'number'],
                    ['key' => 'remarks', 'label' => 'Remarks', 'type' => 'textarea'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.observation_fields.0.key', 'ambient_temp')
            ->assertJsonPath('data.observation_fields.1.key', 'remarks')
            ->json('data');

        $this->assertDatabaseHas('inspection_templates', ['id' => $template['id']]);
        $this->assertNotNull(InspectionTemplate::query()->find($template['id'])->observation_fields);
    }
}
