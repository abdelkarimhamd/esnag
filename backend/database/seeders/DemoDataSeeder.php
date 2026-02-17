<?php

namespace Database\Seeders;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\CloseoutEvidence;
use App\Models\CloseoutInstance;
use App\Models\CloseoutInstanceItem;
use App\Models\CloseoutTemplate;
use App\Models\CloseoutTemplateItem;
use App\Models\DelegationRule;
use App\Models\DashboardConfig;
use App\Models\Drawing;
use App\Models\DrawingLocationZone;
use App\Models\DrawingRevision;
use App\Models\DrawingRevisionMapping;
use App\Models\Equipment;
use App\Models\EquipmentMaintenanceLog;
use App\Models\ExportJob;
use App\Models\Floor;
use App\Models\InspectionApproval;
use App\Models\InspectionApprovalMessage;
use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionRequest;
use App\Models\InspectionSignature;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Location;
use App\Models\MobileDeviceToken;
use App\Models\MobileSyncOperationLog;
use App\Models\NotificationPreference;
use App\Models\OnboardingTourProgress;
use App\Models\OpsHealthEvent;
use App\Models\Organization;
use App\Models\OrganizationFeatureFlag;
use App\Models\OrganizationInvite;
use App\Models\OrganizationUsageLimit;
use App\Models\ProjectUserRole;
use App\Models\Project;
use App\Models\RootCauseCategory;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\Snag;
use App\Models\SnagAttachment;
use App\Models\SnagComment;
use App\Models\SnagCommentAttachment;
use App\Models\SnagCommentMention;
use App\Models\SnagEscalation;
use App\Models\SnagEscalationRule;
use App\Models\SnagReminderPolicy;
use App\Models\SnagStatusHistory;
use App\Models\SnagWatcher;
use App\Models\User;
use App\Models\WorkflowAutomationRule;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

use function setPermissionsTeamId;

class DemoDataSeeder extends Seeder
{
    private int $snagRefCounter = 1;
    private int $inspectionTemplateCounter = 1;
    private int $inspectionSubmissionCounter = 1;
    private int $inspectionRequestCounter = 1;

    public function run(): void
    {
        $this->initializeReferenceCounters();

        Storage::disk('public')->makeDirectory('seed');

        $samplePng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAlgAAAH0CAIAAADhUFPUAAAACXBIWXMAAAsSAAALEgHS3X78AAAAFUlEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAN4G7tsAAf+0GX8AAAAASUVORK5CYII=');
        $samplePdf = <<<PDF
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>
endobj
4 0 obj << /Length 44 >>
stream
BT /F1 18 Tf 20 120 Td (eSnagging Demo Revision) Tj ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000207 00000 n 
0000000305 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
374
%%EOF
PDF;
        $sampleVideo = str_repeat('video-seed', 64);

        $organizations = collect([
            [
                'name' => 'Skyline Contracting',
                'code' => 'ORG-SKY',
                'description' => 'High-rise and mixed-use contractor.',
            ],
            [
                'name' => 'Apex Build Co',
                'code' => 'ORG-APX',
                'description' => 'Residential and hospitality specialist.',
            ],
        ])->map(fn (array $data) => Organization::query()->updateOrCreate(['code' => $data['code']], $data));

        $inspectionTemplatePlan = [3, 3, 2, 2];
        $inspectionSubmissionPlan = [13, 13, 12, 12];
        $projectSeedIndex = 0;

        foreach ($organizations as $organization) {
            RbacSeeder::seedRolesForOrganization($organization);

            $users = $this->seedUsers($organization);
            $rootCauseCategories = $this->seedRootCauseCategories($organization, $users);
            $projects = $this->seedProjects($organization);
            $this->seedTemplateLibraries($organization, $users);
            $stakeholders = $this->seedStakeholders($organization, $projects, $users);
            $organizationSnags = collect();

            foreach ($projects as $project) {
                $hierarchy = $this->seedHierarchy($organization, $project);
                $drawings = $this->seedDrawingsAndRevisions($organization, $project, $hierarchy, $users, $samplePng, $samplePdf);
                $templates = $this->seedCloseoutTemplates($organization, $project, $users);

                $snagCount = fake()->numberBetween(20, 30);
                $projectSnags = $this->seedSnags(
                    $organization,
                    $project,
                    $drawings,
                    $hierarchy['locations'],
                    $users,
                    $rootCauseCategories,
                    $snagCount,
                    $samplePng,
                    $sampleVideo
                );
                $this->applyStakeholderAssignments($organization, $project, $projectSnags, $stakeholders, $users);
                $this->seedSnagCollaborationData(
                    $organization,
                    $project,
                    $projectSnags,
                    $users,
                    $stakeholders['teams_by_project'][$project->id] ?? collect(),
                    $samplePng
                );
                $organizationSnags = $organizationSnags->merge($projectSnags);

                $this->seedEquipmentAndMaintenance(
                    $organization,
                    $project,
                    $hierarchy['locations'],
                    $users,
                    $projectSnags
                );

                $this->seedCloseoutInstances($organization, $project, $projectSnags, $templates, $users, $samplePng);
                $this->seedInspections(
                    $organization,
                    $project,
                    $users,
                    $samplePng,
                    $inspectionTemplatePlan[$projectSeedIndex] ?? 2,
                    $inspectionSubmissionPlan[$projectSeedIndex] ?? 12
                );
                $this->seedInspectionApprovalMessages($organization, $project, $users);

                $projectSeedIndex++;
            }

            $this->seedNotificationPreferences($organization, $users);
            $this->seedOnboardingProgress($organization, $users);
            $this->seedOpsControlsAndReliabilityData($organization, $projects, $users);
            $this->seedExportJobs($organization, $projects, $users, $organizationSnags);
            $this->seedDelegations($organization, $projects, $users);
            $this->seedEscalationRulesAndHistory($organization, $projects, $users, $organizationSnags);
            $this->seedDashboardConfigs($organization, $users);
            $this->seedWorkflowAutomationAndRecurring($organization, $projects, $users, $stakeholders['teams_by_project'] ?? []);
        }
    }

    private function initializeReferenceCounters(): void
    {
        $this->snagRefCounter = $this->nextSequence(Snag::class, 'reference', 'SNG-');
        $this->inspectionTemplateCounter = $this->nextSequence(InspectionTemplate::class, 'code', 'INSP-TPL-');
        $this->inspectionSubmissionCounter = $this->nextSequence(InspectionSubmission::class, 'reference', 'INSP-');
        $this->inspectionRequestCounter = $this->nextSequence(InspectionRequest::class, 'reference', 'REQ-');
    }

    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     */
    private function nextSequence(string $modelClass, string $column, string $prefix): int
    {
        $values = $modelClass::query()
            ->where($column, 'like', $prefix.'%')
            ->pluck($column);

        $pattern = '/^'.preg_quote($prefix, '/').'(\d+)$/';
        $max = 0;

        foreach ($values as $value) {
            if (! is_string($value)) {
                continue;
            }

            if (preg_match($pattern, $value, $matches) !== 1) {
                continue;
            }

            $numeric = (int) $matches[1];
            if ($numeric > $max) {
                $max = $numeric;
            }
        }

        return $max + 1;
    }

    /**
     * @return array<string, User>
     */
    private function seedUsers(Organization $organization): array
    {
        $orgKey = strtolower(str_replace('ORG-', '', $organization->code));

        $seedUsers = [
            'org_admin' => ['name' => $organization->name.' Admin', 'email' => "admin@{$orgKey}.demo"],
            'project_manager' => ['name' => $organization->name.' Manager', 'email' => "manager@{$orgKey}.demo"],
            'engineer' => ['name' => $organization->name.' Engineer', 'email' => "engineer@{$orgKey}.demo"],
            'inspector' => ['name' => $organization->name.' Inspector', 'email' => "inspector@{$orgKey}.demo"],
            'viewer' => ['name' => $organization->name.' Viewer', 'email' => "viewer@{$orgKey}.demo"],
            'engineer_2' => ['name' => $organization->name.' Engineer 2', 'email' => "engineer2@{$orgKey}.demo"],
        ];

        $users = [];

        foreach ($seedUsers as $role => $data) {
            $user = User::query()->updateOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'password' => 'password',
                    'email_verified_at' => Carbon::now(),
                ]
            );

            $organization->users()->syncWithoutDetaching([
                $user->id => [
                    'job_title' => str_replace('_', ' ', $role),
                    'is_active' => true,
                    'joined_at' => Carbon::now()->subDays(fake()->numberBetween(30, 180)),
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
            ]);

            setPermissionsTeamId($organization->id);
            $user->syncRoles($role === 'engineer_2' ? 'engineer' : $role);

            $users[$role] = $user;
        }

        return $users;
    }

    /**
     * @param  array<string, User>  $users
     * @return Collection<int, RootCauseCategory>
     */
    private function seedRootCauseCategories(Organization $organization, array $users): Collection
    {
        $definitions = [
            ['name' => 'Design Coordination', 'code' => 'RC-DESIGN'],
            ['name' => 'Material Defect', 'code' => 'RC-MAT'],
            ['name' => 'Installation Error', 'code' => 'RC-INSTALL'],
            ['name' => 'Workmanship', 'code' => 'RC-WORK'],
            ['name' => 'Documentation Gap', 'code' => 'RC-DOC'],
            ['name' => 'Access Constraint', 'code' => 'RC-ACCESS'],
            ['name' => 'Safety Non-Compliance', 'code' => 'RC-SAFETY'],
        ];

        return collect($definitions)->map(function (array $definition) use ($organization, $users) {
            return RootCauseCategory::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'name' => $definition['name'],
                ],
                [
                    'code' => $definition['code'],
                    'description' => fake()->sentence(),
                    'is_active' => true,
                    'created_by' => $users['org_admin']->id,
                ],
            );
        });
    }

    /**
     * @return Collection<int, Project>
     */
    private function seedProjects(Organization $organization): Collection
    {
        return collect([1, 2])->map(function (int $index) use ($organization) {
            return Project::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'code' => sprintf('%s-P%d', str_replace('ORG-', '', $organization->code), $index),
                ],
                [
                    'name' => $organization->name.' Project '.$index,
                    'description' => fake()->paragraph(),
                    'status' => 'active',
                    'is_training' => $index === 1,
                    'training_locked' => $index === 1,
                    'training_notes' => $index === 1
                        ? 'Training mode project. Practice safely; persistent writes are blocked by policy.'
                        : null,
                    'start_date' => Carbon::now()->subMonths(8 + $index),
                    'end_date' => Carbon::now()->addMonths(8 + $index),
                ]
            );
        });
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedTemplateLibraries(Organization $organization, array $users): void
    {
        $closeoutCatalog = [
            [
                'key' => 'closeout_architectural_handover_v1',
                'name' => 'Library: Architectural Handover Checklist',
                'trade' => 'Architectural',
                'discipline' => 'Architectural',
                'description' => 'Prebuilt architectural closeout checklist for room-level handover.',
                'items' => [
                    ['title' => 'Finishes inspected and snag-free', 'required' => true, 'evidence_required' => true],
                    ['title' => 'Door hardware and ironmongery tested', 'required' => true, 'evidence_required' => true],
                    ['title' => 'As-built architectural markup attached', 'required' => true, 'evidence_required' => false],
                    ['title' => 'Space cleaned for client walkthrough', 'required' => true, 'evidence_required' => true],
                ],
            ],
            [
                'key' => 'closeout_mep_commissioning_v1',
                'name' => 'Library: MEP Commissioning Closeout',
                'trade' => 'MEP',
                'discipline' => 'MEP',
                'description' => 'Prebuilt MEP closeout checklist with commissioning evidence requirements.',
                'items' => [
                    ['title' => 'Commissioning sheets approved', 'required' => true, 'evidence_required' => true],
                    ['title' => 'O&M manuals uploaded', 'required' => true, 'evidence_required' => false],
                    ['title' => 'Functional tests witnessed by consultant', 'required' => true, 'evidence_required' => true],
                    ['title' => 'Labeling and tagging verified', 'required' => true, 'evidence_required' => true],
                ],
            ],
            [
                'key' => 'closeout_civil_structure_v1',
                'name' => 'Library: Civil Structural Completion',
                'trade' => 'Civil',
                'discipline' => 'Civil',
                'description' => 'Prebuilt structural and civil closeout checklist.',
                'items' => [
                    ['title' => 'Concrete repair records verified', 'required' => true, 'evidence_required' => true],
                    ['title' => 'Survey closeout report attached', 'required' => true, 'evidence_required' => true],
                    ['title' => 'Protection works removed safely', 'required' => true, 'evidence_required' => false],
                    ['title' => 'Final civil punch list approved', 'required' => true, 'evidence_required' => true],
                ],
            ],
        ];

        foreach ($closeoutCatalog as $entry) {
            $template = CloseoutTemplate::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'is_library' => true,
                    'library_key' => $entry['key'],
                ],
                [
                    'project_id' => null,
                    'name' => $entry['name'],
                    'trade' => $entry['trade'],
                    'discipline' => $entry['discipline'],
                    'description' => $entry['description'],
                    'is_default' => false,
                    'is_active' => true,
                    'created_by' => $users['project_manager']->id,
                ],
            );

            $template->items()->delete();

            foreach ($entry['items'] as $itemIndex => $item) {
                CloseoutTemplateItem::query()->create([
                    'closeout_template_id' => $template->id,
                    'title' => $item['title'],
                    'description' => null,
                    'required' => $item['required'],
                    'evidence_required' => $item['evidence_required'],
                    'sort_order' => $itemIndex,
                ]);
            }
        }

        $inspectionCatalog = [
            [
                'key' => 'inspection_ncr_civil_v1',
                'name' => 'Library: Civil NCR Workflow',
                'code' => 'LIB-NCR-CIV',
                'type' => 'ncr',
                'discipline' => 'Civil',
                'description' => 'Prebuilt NCR inspection form and approvals for civil discipline.',
            ],
            [
                'key' => 'inspection_wir_architectural_v1',
                'name' => 'Library: Architectural WIR',
                'code' => 'LIB-WIR-ARC',
                'type' => 'wir',
                'discipline' => 'Architectural',
                'description' => 'Prebuilt WIR inspection form for architectural activities.',
            ],
            [
                'key' => 'inspection_mir_mep_v1',
                'name' => 'Library: MEP MIR',
                'code' => 'LIB-MIR-MEP',
                'type' => 'mir',
                'discipline' => 'MEP',
                'description' => 'Prebuilt MIR inspection form for MEP material approvals.',
            ],
            [
                'key' => 'inspection_safety_walkthrough_v1',
                'name' => 'Library: Safety Walkthrough',
                'code' => 'LIB-SAFE-001',
                'type' => 'safety',
                'discipline' => 'Safety',
                'description' => 'Prebuilt safety walkthrough checklist.',
            ],
        ];

        foreach ($inspectionCatalog as $entry) {
            InspectionTemplate::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'is_library' => true,
                    'library_key' => $entry['key'],
                ],
                [
                    'project_id' => null,
                    'name' => $entry['name'],
                    'code' => $entry['code'],
                    'type' => $entry['type'],
                    'discipline' => $entry['discipline'],
                    'description' => $entry['description'],
                    'schema' => [
                        'sections' => [
                            [
                                'title' => 'General Information',
                                'fields' => [
                                    ['key' => 'location', 'label' => 'Location', 'type' => 'text', 'required' => true],
                                    ['key' => 'inspection_date', 'label' => 'Inspection Date', 'type' => 'date', 'required' => true],
                                    ['key' => 'remarks', 'label' => 'Remarks', 'type' => 'textarea', 'required' => true],
                                ],
                            ],
                            [
                                'title' => 'Result',
                                'fields' => [
                                    ['key' => 'result', 'label' => 'Result', 'type' => 'select', 'required' => true, 'options' => ['pass', 'fail', 'hold']],
                                    ['key' => 'risk_level', 'label' => 'Risk Level', 'type' => 'select', 'required' => false, 'options' => ['low', 'medium', 'high']],
                                    ['key' => 'photos_attached', 'label' => 'Photos Attached', 'type' => 'checkbox', 'required' => false],
                                ],
                            ],
                        ],
                    ],
                    'approval_workflow' => [
                        ['step_order' => 1, 'step_name' => 'Consultant Review', 'role_name' => 'inspector', 'requires_signature' => false],
                        ['step_order' => 2, 'step_name' => 'Owner Sign-off', 'role_name' => 'org_admin', 'requires_signature' => true],
                    ],
                    'is_active' => true,
                    'version' => 1,
                    'created_by' => $users['project_manager']->id,
                ],
            );
        }
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  array<string, User>  $users
     * @return array{companies: Collection<int, StakeholderCompany>, teams_by_project: array<int, Collection<int, StakeholderTeam>>}
     */
    private function seedStakeholders(Organization $organization, Collection $projects, array $users): array
    {
        $companies = collect([
            [
                'name' => $organization->name.' Owner Office',
                'code' => strtoupper(str_replace('ORG-', '', $organization->code)).'-OWN',
                'type' => 'owner',
            ],
            [
                'name' => $organization->name.' Consultant PM',
                'code' => strtoupper(str_replace('ORG-', '', $organization->code)).'-CON',
                'type' => 'consultant',
            ],
            [
                'name' => $organization->name.' Main Contractor',
                'code' => strtoupper(str_replace('ORG-', '', $organization->code)).'-CTR',
                'type' => 'contractor',
            ],
        ])->map(function (array $row) use ($organization) {
            return StakeholderCompany::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'name' => $row['name'],
                ],
                [
                    'code' => $row['code'],
                    'type' => $row['type'],
                    'is_active' => true,
                ]
            );
        });

        $ownerCompany = $companies->firstWhere('type', 'owner');
        $consultantCompany = $companies->firstWhere('type', 'consultant');
        $contractorCompany = $companies->firstWhere('type', 'contractor');

        if ($ownerCompany) {
            $ownerCompany->users()->sync([
                $users['org_admin']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => true],
                $users['viewer']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => false],
            ]);
        }

        if ($consultantCompany) {
            $consultantCompany->users()->sync([
                $users['project_manager']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => true],
                $users['inspector']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => false],
            ]);
        }

        if ($contractorCompany) {
            $contractorCompany->users()->sync([
                $users['engineer']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => true],
                $users['engineer_2']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_primary' => false],
            ]);
        }

        ProjectUserRole::query()->where('organization_id', $organization->id)->delete();

        $teamsByProject = [];
        foreach ($projects as $index => $project) {
            $consultantTeam = StakeholderTeam::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Consultant Review Team',
                ],
                [
                    'company_id' => $consultantCompany?->id,
                    'code' => $project->code.'-QAC',
                    'is_active' => true,
                ]
            );

            $consultantTeam->users()->sync([
                $users['project_manager']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => true],
                $users['inspector']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => false],
            ]);

            $contractorTeam = StakeholderTeam::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Contractor Delivery Team',
                ],
                [
                    'company_id' => $contractorCompany?->id,
                    'code' => $project->code.'-EXE',
                    'is_active' => true,
                ]
            );

            $contractorTeam->users()->sync([
                $users['engineer']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => true],
                $users['engineer_2']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => false],
            ]);

            $ownerTeam = StakeholderTeam::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Owner Witness Team',
                ],
                [
                    'company_id' => $ownerCompany?->id,
                    'code' => $project->code.'-OWN',
                    'is_active' => true,
                ]
            );

            $ownerTeam->users()->sync([
                $users['org_admin']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => true],
                $users['viewer']->id => ['organization_id' => $organization->id, 'is_active' => true, 'is_lead' => false],
            ]);

            $teamsByProject[$project->id] = collect([$consultantTeam, $contractorTeam, $ownerTeam]);

            $projectRoleAssignments = $index === 0
                ? [
                    $users['project_manager']->id => ['consultant'],
                    $users['inspector']->id => ['consultant'],
                    $users['engineer']->id => ['contractor'],
                    $users['engineer_2']->id => ['contractor'],
                    $users['viewer']->id => ['owner'],
                ]
                : [
                    $users['project_manager']->id => ['consultant'],
                    $users['inspector']->id => ['consultant'],
                    $users['engineer']->id => ['consultant'],
                    $users['engineer_2']->id => ['contractor'],
                    $users['viewer']->id => ['owner'],
                ];

            foreach ($projectRoleAssignments as $userId => $roleNames) {
                foreach ($roleNames as $roleName) {
                    ProjectUserRole::query()->create([
                        'organization_id' => $organization->id,
                        'project_id' => $project->id,
                        'user_id' => $userId,
                        'role_name' => $roleName,
                        'source' => 'seed',
                    ]);
                }
            }
        }

        return [
            'companies' => $companies,
            'teams_by_project' => $teamsByProject,
        ];
    }

    /**
     * @param  Collection<int, Snag>  $snags
     * @param  array{companies: Collection<int, StakeholderCompany>, teams_by_project: array<int, Collection<int, StakeholderTeam>>}  $stakeholders
     * @param  array<string, User>  $users
     */
    private function applyStakeholderAssignments(Organization $organization, Project $project, Collection $snags, array $stakeholders, array $users): void
    {
        /** @var Collection<int, StakeholderTeam> $teams */
        $teams = $stakeholders['teams_by_project'][$project->id] ?? collect();
        if ($teams->isEmpty()) {
            return;
        }

        $teams->each(function (StakeholderTeam $team): void {
            $team->loadMissing(['company', 'users']);
        });
        $fallbackCompany = $stakeholders['companies']->firstWhere('type', 'contractor');

        foreach ($snags as $snag) {
            if (! fake()->boolean(72)) {
                continue;
            }

            /** @var StakeholderTeam $team */
            $team = $teams->random();
            $company = $team->company ?: $fallbackCompany;

            $assigneeId = $snag->assigned_to;
            if (! $assigneeId && fake()->boolean(58)) {
                $candidate = $team->users->first();
                $assigneeId = $candidate?->id;
            }

            if (! $assigneeId && $team->name === 'Owner Witness Team') {
                $assigneeId = $users['org_admin']->id;
            }

            $snag->assigned_company_id = $company?->id;
            $snag->assigned_team_id = $team->id;
            $snag->assigned_to = $assigneeId;

            if ($assigneeId) {
                $snag->dispatched_to = $assigneeId;
                $snag->dispatch_note = fake()->randomElement([
                    'Dispatched during weekly coordination.',
                    'Delegated to field engineer for immediate action.',
                    'Owner requested named dispatcher for follow-up.',
                ]);
                $snag->dispatched_at = Carbon::parse($snag->created_at)->addHours(fake()->numberBetween(1, 18));
                if ($snag->status === SnagStatus::New->value) {
                    $snag->status = SnagStatus::Assigned->value;
                }
            }

            $snag->save();
        }
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  array<string, User>  $users
     */
    private function seedDelegations(Organization $organization, Collection $projects, array $users): void
    {
        DelegationRule::query()->where('organization_id', $organization->id)->delete();

        /** @var Project|null $firstProject */
        $firstProject = $projects->first();
        /** @var Project|null $secondProject */
        $secondProject = $projects->get(1);

        if ($firstProject) {
            DelegationRule::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $firstProject->id,
                'delegator_user_id' => $users['project_manager']->id,
                'delegate_user_id' => $users['engineer_2']->id,
                'scope' => DelegationRule::SCOPE_ASSIGNMENTS,
                'starts_at' => Carbon::now()->subDays(2),
                'ends_at' => Carbon::now()->addDays(14),
                'is_active' => true,
                'reason' => 'Project manager on leave - delegate assignment operations.',
                'created_by' => $users['org_admin']->id,
            ]);
        }

        if ($secondProject) {
            DelegationRule::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $secondProject->id,
                'delegator_user_id' => $users['inspector']->id,
                'delegate_user_id' => $users['engineer']->id,
                'scope' => DelegationRule::SCOPE_APPROVALS,
                'starts_at' => Carbon::now()->subDay(),
                'ends_at' => Carbon::now()->addDays(10),
                'is_active' => true,
                'reason' => 'Inspector rotation coverage for approval actions.',
                'created_by' => $users['org_admin']->id,
            ]);
        }

        DelegationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => null,
            'delegator_user_id' => $users['org_admin']->id,
            'delegate_user_id' => $users['project_manager']->id,
            'scope' => DelegationRule::SCOPE_ALL,
            'starts_at' => Carbon::now()->subDay(),
            'ends_at' => Carbon::now()->addDays(30),
            'is_active' => true,
            'reason' => 'Executive cover delegation.',
            'created_by' => $users['org_admin']->id,
        ]);
    }

    /**
     * @return array{buildings: Collection<int, Building>, floors: Collection<int, Floor>, locations: Collection<int, Location>}
     */
    private function seedHierarchy(Organization $organization, Project $project): array
    {
        $buildings = collect(['A', 'B'])->map(function (string $suffix, int $index) use ($organization, $project) {
            return Building::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'code' => 'BLD-'.$suffix,
                ],
                [
                    'name' => 'Building '.$suffix,
                    'sort_order' => $index,
                ]
            );
        });

        $floors = collect();
        $locations = collect();

        foreach ($buildings as $building) {
            $floorSpecs = [
                ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                ['name' => 'First Floor', 'code' => 'F1', 'level' => 1],
                ['name' => 'Second Floor', 'code' => 'F2', 'level' => 2],
            ];

            foreach ($floorSpecs as $sort => $floorSpec) {
                $floor = Floor::query()->updateOrCreate(
                    [
                        'organization_id' => $organization->id,
                        'building_id' => $building->id,
                        'code' => $floorSpec['code'],
                    ],
                    [
                        'name' => $floorSpec['name'],
                        'level' => $floorSpec['level'],
                        'sort_order' => $sort,
                    ]
                );

                $floors->push($floor);

                foreach ([1, 2, 3, 4] as $locIndex) {
                    $location = Location::query()->updateOrCreate(
                        [
                            'organization_id' => $organization->id,
                            'floor_id' => $floor->id,
                            'code' => sprintf('%s-L%02d', $floor->code, $locIndex),
                        ],
                        [
                            'name' => fake()->randomElement(['Lobby', 'Apartment', 'Corridor', 'MEP Room']).' '.$locIndex,
                            'type' => fake()->randomElement(['room', 'corridor', 'service']),
                            'barcode' => sprintf('BC-%d-%d-%d', $organization->id, $floor->id, $locIndex),
                        ]
                    );

                    $locations->push($location);
                }
            }
        }

        return [
            'buildings' => $buildings,
            'floors' => $floors,
            'locations' => $locations,
        ];
    }

    /**
     * @param  array<string, User>  $users
     * @param  array{buildings: Collection<int, Building>, floors: Collection<int, Floor>, locations: Collection<int, Location>}  $hierarchy
     * @return Collection<int, Drawing>
     */
    private function seedDrawingsAndRevisions(Organization $organization, Project $project, array $hierarchy, array $users, string $samplePng, string $samplePdf): Collection
    {
        $drawings = collect();

        foreach ([1, 2, 3, 4] as $index) {
            /** @var Floor $floor */
            $floor = $hierarchy['floors']->random();
            /** @var Building $building */
            $building = $hierarchy['buildings']->firstWhere('id', $floor->building_id);

            $drawing = Drawing::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'code' => sprintf('%s-DRW-%02d', $project->code, $index),
                ],
                [
                    'building_id' => $building->id,
                    'floor_id' => $floor->id,
                    'title' => fake()->randomElement(['General Arrangement', 'MEP Layout', 'Architectural Plan', 'Fire Strategy']).' '.$index,
                    'description' => fake()->sentence(),
                ]
            );

            $basePath = sprintf('seed/org_%d/project_%d/drawing_%d', $organization->id, $project->id, $drawing->id);

            $rev1Path = $basePath.'-r1.png';
            $rev2Path = $index % 2 === 0 ? $basePath.'-r2.pdf' : $basePath.'-r2.png';

            Storage::disk('public')->put($rev1Path, $samplePng);
            Storage::disk('public')->put($rev2Path, $index % 2 === 0 ? $samplePdf : $samplePng);

            $revision1 = DrawingRevision::query()->updateOrCreate(
                [
                    'drawing_id' => $drawing->id,
                    'revision_label' => 'R1',
                ],
                [
                    'organization_id' => $organization->id,
                    'file_name' => basename($rev1Path),
                    'file_path' => $rev1Path,
                    'mime_type' => 'image/png',
                    'file_size' => strlen($samplePng),
                    'uploaded_by' => $users['project_manager']->id,
                    'notes' => 'Initial issue set',
                    'is_current' => false,
                ]
            );

            $revision2 = DrawingRevision::query()->updateOrCreate(
                [
                    'drawing_id' => $drawing->id,
                    'revision_label' => 'R2',
                ],
                [
                    'organization_id' => $organization->id,
                    'file_name' => basename($rev2Path),
                    'file_path' => $rev2Path,
                    'mime_type' => $index % 2 === 0 ? 'application/pdf' : 'image/png',
                    'file_size' => $index % 2 === 0 ? strlen($samplePdf) : strlen($samplePng),
                    'uploaded_by' => $users['project_manager']->id,
                    'notes' => 'Latest coordinated issue set',
                    'is_current' => true,
                ]
            );

            $revision1->update(['is_current' => false]);
            $drawing->update(['current_revision_id' => $revision2->id]);

            $this->seedRevisionMapping($organization, $drawing, $revision1, $revision2, $users['project_manager']);
            $this->seedDrawingZones($organization, $drawing, $hierarchy['locations'], $users['project_manager']);

            $drawings->push($drawing->fresh(['revisions', 'currentRevision']));
        }

        return $drawings;
    }

    private function seedRevisionMapping(
        Organization $organization,
        Drawing $drawing,
        DrawingRevision $fromRevision,
        DrawingRevision $toRevision,
        User $creator
    ): void {
        $transformType = fake()->randomElement(['identity', 'offset_scale', 'affine']);

        $transformParams = match ($transformType) {
            'offset_scale' => [
                'scale_x' => fake()->randomFloat(5, 0.96, 1.04),
                'scale_y' => fake()->randomFloat(5, 0.96, 1.04),
                'offset_x' => fake()->randomFloat(5, -0.04, 0.04),
                'offset_y' => fake()->randomFloat(5, -0.04, 0.04),
            ],
            'affine' => [
                'a' => fake()->randomFloat(6, 0.97, 1.03),
                'b' => fake()->randomFloat(6, -0.02, 0.02),
                'c' => fake()->randomFloat(6, -0.03, 0.03),
                'd' => fake()->randomFloat(6, -0.02, 0.02),
                'e' => fake()->randomFloat(6, 0.97, 1.03),
                'f' => fake()->randomFloat(6, -0.03, 0.03),
            ],
            default => [],
        };

        DrawingRevisionMapping::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'drawing_id' => $drawing->id,
                'from_revision_id' => $fromRevision->id,
                'to_revision_id' => $toRevision->id,
            ],
            [
                'transform_type' => $transformType,
                'transform_params' => $transformParams,
                'confidence_score' => fake()->randomFloat(2, 72, 98),
                'notes' => fake()->randomElement([
                    'Auto-generated alignment from control points.',
                    'Mapped by coordination team after revision issue.',
                    'Estimated transform for snag migration assistance.',
                ]),
                'created_by' => $creator->id,
            ]
        );
    }

    /**
     * @param  Collection<int, Location>  $locations
     */
    private function seedDrawingZones(Organization $organization, Drawing $drawing, Collection $locations, User $creator): void
    {
        if (! $drawing->floor_id) {
            return;
        }

        $floorLocations = $locations
            ->where('floor_id', $drawing->floor_id)
            ->values();

        if ($floorLocations->isEmpty()) {
            return;
        }

        $selectedLocations = $floorLocations
            ->shuffle()
            ->take(min(4, $floorLocations->count()))
            ->values();

        $grid = [
            ['x_min' => 0.05, 'y_min' => 0.05, 'x_max' => 0.45, 'y_max' => 0.45],
            ['x_min' => 0.55, 'y_min' => 0.05, 'x_max' => 0.95, 'y_max' => 0.45],
            ['x_min' => 0.05, 'y_min' => 0.55, 'x_max' => 0.45, 'y_max' => 0.95],
            ['x_min' => 0.55, 'y_min' => 0.55, 'x_max' => 0.95, 'y_max' => 0.95],
        ];

        foreach ($selectedLocations as $index => $location) {
            $slot = $grid[$index] ?? $grid[array_rand($grid)];
            $jitter = fake()->randomFloat(4, -0.02, 0.02);

            $xMin = max(0, min(1, $slot['x_min'] + $jitter));
            $yMin = max(0, min(1, $slot['y_min'] + $jitter));
            $xMax = max($xMin + 0.05, min(1, $slot['x_max'] + $jitter));
            $yMax = max($yMin + 0.05, min(1, $slot['y_max'] + $jitter));

            DrawingLocationZone::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'drawing_id' => $drawing->id,
                    'location_id' => $location->id,
                    'zone_label' => 'Zone '.($index + 1),
                ],
                [
                    'drawing_revision_id' => null,
                    'x_min' => round($xMin, 6),
                    'y_min' => round($yMin, 6),
                    'x_max' => round($xMax, 6),
                    'y_max' => round($yMax, 6),
                    'priority' => 110 - ($index * 5),
                    'metadata' => [
                        'seeded' => true,
                        'location_code' => $location->code,
                    ],
                    'created_by' => $creator->id,
                ]
            );
        }
    }

    /**
     * @param  Collection<int, Drawing>  $drawings
     * @param  Collection<int, Location>  $locations
     * @param  array<string, User>  $users
     * @return Collection<int, Snag>
     */
    private function seedSnags(
        Organization $organization,
        Project $project,
        Collection $drawings,
        Collection $locations,
        array $users,
        Collection $rootCauseCategories,
        int $count,
        string $samplePng,
        string $sampleVideo
    ): Collection {
        $assignable = collect([$users['project_manager'], $users['engineer'], $users['engineer_2'], $users['inspector']]);
        $authors = collect([$users['project_manager'], $users['engineer'], $users['engineer_2']]);
        $seeded = collect();
        $zonesByDrawing = DrawingLocationZone::query()
            ->where('organization_id', $organization->id)
            ->whereIn('drawing_id', $drawings->pluck('id')->all())
            ->get()
            ->groupBy('drawing_id');

        for ($i = 0; $i < $count; $i++) {
            /** @var Drawing $drawing */
            $drawing = $drawings->random();
            /** @var Collection<int, Location> $drawingLocations */
            $drawingLocations = $locations
                ->where('floor_id', $drawing->floor_id)
                ->values();

            if ($drawingLocations->isEmpty()) {
                $drawingLocations = $locations;
            }

            /** @var Collection<int, DrawingLocationZone> $zonesForDrawing */
            $zonesForDrawing = ($zonesByDrawing->get($drawing->id) ?? collect())->values();
            /** @var DrawingLocationZone|null $seedZone */
            $seedZone = null;

            if ($zonesForDrawing->isNotEmpty() && fake()->boolean(80)) {
                $seedZone = $zonesForDrawing->random();
            }

            /** @var Location|null $location */
            $location = null;
            if ($seedZone) {
                $location = $drawingLocations->firstWhere('id', $seedZone->location_id)
                    ?? $locations->firstWhere('id', $seedZone->location_id);
            }

            if (! $location) {
                $location = $drawingLocations->random();
            }

            /** @var Floor $floor */
            $floor = Floor::query()->findOrFail($location->floor_id);
            [$pinX, $pinY] = $this->pinForSeedZone($seedZone);

            $status = $this->randomStatus();
            $assigned = $status === SnagStatus::New->value ? null : $assignable->random();
            $creator = $authors->random();
            $createdAt = Carbon::now()->subDays(fake()->numberBetween(1, 80))->subHours(fake()->numberBetween(0, 20));

            $snag = Snag::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'drawing_revision_id' => $drawing->current_revision_id,
                'building_id' => $floor->building_id,
                'floor_id' => $floor->id,
                'location_id' => $location->id,
                'root_cause_category_id' => fake()->boolean(82) && $rootCauseCategories->isNotEmpty()
                    ? $rootCauseCategories->random()->id
                    : null,
                'reference' => sprintf('SNG-%05d', $this->snagRefCounter++),
                'title' => fake()->randomElement([
                    'Paint touch-up required',
                    'Sealant gap at glazing edge',
                    'Loose fixture at corridor',
                    'Ceiling tile misalignment',
                    'Door closer requires adjustment',
                    'Waterproofing concern at wet area',
                ]),
                'description' => fake()->sentence(16),
                'priority' => fake()->randomElement(Snag::PRIORITIES),
                'trade' => fake()->randomElement(['Electrical', 'Mechanical', 'Civil', 'Architectural', 'Safety']),
                'status' => $status,
                'pin_x' => $pinX,
                'pin_y' => $pinY,
                'created_by' => $creator->id,
                'assigned_to' => $assigned?->id,
                'due_date' => Carbon::now()->addDays(fake()->numberBetween(5, 45)),
                'estimated_cost' => fake()->optional(0.55)->randomFloat(2, 120, 12000),
                'estimated_hours' => fake()->optional(0.6)->randomFloat(2, 1.5, 96),
                'acknowledged_at' => null,
                'started_at' => null,
                'ready_for_review_at' => null,
                'closed_at' => $status === SnagStatus::Closed->value ? Carbon::now()->subDays(fake()->numberBetween(1, 15)) : null,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            if ($status !== SnagStatus::New->value) {
                $snag->acknowledged_at = $createdAt->copy()->addHours(fake()->numberBetween(1, 18));
            }

            if (in_array($status, [SnagStatus::InProgress->value, SnagStatus::ReadyForReview->value, SnagStatus::Closed->value], true)) {
                $snag->started_at = $createdAt->copy()->addHours(fake()->numberBetween(5, 32));
            }

            if (in_array($status, [SnagStatus::ReadyForReview->value, SnagStatus::Closed->value], true)) {
                $snag->ready_for_review_at = $createdAt->copy()->addHours(fake()->numberBetween(18, 72));
            }

            $snag->save();

            $this->seedStatusHistory($snag, $organization, $creator, $assigned, $createdAt);
            $this->seedComments($snag, $organization, [$creator, $assigned, $users['inspector'], $users['project_manager']]);
            $this->seedAttachments($snag, $organization, $creator, $samplePng, $sampleVideo);
            $seeded->push($snag);
        }

        return $seeded;
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function pinForSeedZone(?DrawingLocationZone $zone): array
    {
        if (! $zone) {
            return [
                fake()->randomFloat(6, 0.02, 0.98),
                fake()->randomFloat(6, 0.02, 0.98),
            ];
        }

        $paddingX = min(0.08, max(0.01, ($zone->x_max - $zone->x_min) / 5));
        $paddingY = min(0.08, max(0.01, ($zone->y_max - $zone->y_min) / 5));

        $minX = max(0, $zone->x_min + $paddingX);
        $maxX = min(1, $zone->x_max - $paddingX);
        $minY = max(0, $zone->y_min + $paddingY);
        $maxY = min(1, $zone->y_max - $paddingY);

        if ($maxX <= $minX || $maxY <= $minY) {
            return [
                round((float) (($zone->x_min + $zone->x_max) / 2), 6),
                round((float) (($zone->y_min + $zone->y_max) / 2), 6),
            ];
        }

        return [
            fake()->randomFloat(6, $minX, $maxX),
            fake()->randomFloat(6, $minY, $maxY),
        ];
    }

    private function randomStatus(): string
    {
        $roll = fake()->numberBetween(1, 100);

        return match (true) {
            $roll <= 20 => SnagStatus::New->value,
            $roll <= 40 => SnagStatus::Assigned->value,
            $roll <= 65 => SnagStatus::InProgress->value,
            $roll <= 80 => SnagStatus::ReadyForReview->value,
            $roll <= 93 => SnagStatus::Closed->value,
            default => SnagStatus::Rejected->value,
        };
    }

    private function seedStatusHistory(Snag $snag, Organization $organization, User $creator, ?User $assignee, Carbon $createdAt): void
    {
        $paths = [
            SnagStatus::New->value => [SnagStatus::New->value],
            SnagStatus::Assigned->value => [SnagStatus::New->value, SnagStatus::Assigned->value],
            SnagStatus::InProgress->value => [SnagStatus::New->value, SnagStatus::Assigned->value, SnagStatus::InProgress->value],
            SnagStatus::ReadyForReview->value => [SnagStatus::New->value, SnagStatus::Assigned->value, SnagStatus::InProgress->value, SnagStatus::ReadyForReview->value],
            SnagStatus::Closed->value => [SnagStatus::New->value, SnagStatus::Assigned->value, SnagStatus::InProgress->value, SnagStatus::ReadyForReview->value, SnagStatus::Closed->value],
            SnagStatus::Rejected->value => [SnagStatus::New->value, SnagStatus::Assigned->value, SnagStatus::Rejected->value],
        ];

        $path = $paths[$snag->status] ?? [SnagStatus::New->value];

        foreach ($path as $index => $toStatus) {
            $fromStatus = $index === 0 ? null : $path[$index - 1];

            SnagStatusHistory::query()->create([
                'snag_id' => $snag->id,
                'organization_id' => $organization->id,
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'changed_by' => $index < 2 ? $creator->id : ($assignee?->id ?? $creator->id),
                'note' => $index === 0 ? 'Snag created from drawing viewer.' : null,
                'metadata' => null,
                'created_at' => $createdAt->copy()->addHours($index * 6),
            ]);
        }
    }

    /**
     * @param  array<int, User|null>  $participants
     */
    private function seedComments(Snag $snag, Organization $organization, array $participants): void
    {
        $cleanParticipants = collect($participants)->filter();
        $commentCount = fake()->numberBetween(1, 4);

        for ($i = 0; $i < $commentCount; $i++) {
            /** @var User $author */
            $author = $cleanParticipants->random();

            SnagComment::query()->create([
                'snag_id' => $snag->id,
                'organization_id' => $organization->id,
                'user_id' => $author->id,
                'body' => fake()->randomElement([
                    'Please verify against latest revision before closure.',
                    'This is visible on site walk-through and needs correction.',
                    'Rework done, awaiting QA review.',
                    'Contractor acknowledged and planned for next shift.',
                ]),
                'is_internal' => fake()->boolean(20),
                'created_at' => $snag->created_at->copy()->addHours($i + 2),
                'updated_at' => $snag->created_at->copy()->addHours($i + 2),
            ]);
        }
    }

    private function seedAttachments(Snag $snag, Organization $organization, User $uploader, string $samplePng, string $sampleVideo): void
    {
        $count = fake()->numberBetween(0, 3);

        for ($i = 0; $i < $count; $i++) {
            $type = fake()->randomElement(['photo', 'photo', 'markup', 'video']);

            $path = null;
            $fileName = null;
            $mime = null;
            $fileSize = null;
            $markupData = null;

            if ($type === 'photo') {
                $path = sprintf('seed/org_%d/snag_%d/photo_%d.png', $organization->id, $snag->id, $i + 1);
                Storage::disk('public')->put($path, $samplePng);
                $fileName = basename($path);
                $mime = 'image/png';
                $fileSize = strlen($samplePng);
            }

            if ($type === 'video') {
                $path = sprintf('seed/org_%d/snag_%d/video_%d.mp4', $organization->id, $snag->id, $i + 1);
                Storage::disk('public')->put($path, $sampleVideo);
                $fileName = basename($path);
                $mime = 'video/mp4';
                $fileSize = strlen($sampleVideo);
            }

            if ($type === 'markup') {
                $markupData = [
                    'color' => '#ff5722',
                    'strokes' => [
                        ['x' => fake()->randomFloat(4, 0.1, 0.8), 'y' => fake()->randomFloat(4, 0.1, 0.8)],
                        ['x' => fake()->randomFloat(4, 0.2, 0.9), 'y' => fake()->randomFloat(4, 0.2, 0.9)],
                    ],
                ];
            }

            SnagAttachment::query()->create([
                'snag_id' => $snag->id,
                'organization_id' => $organization->id,
                'uploaded_by' => $uploader->id,
                'type' => $type,
                'file_name' => $fileName,
                'file_path' => $path,
                'mime_type' => $mime,
                'file_size' => $fileSize,
                'markup_data' => $markupData,
                'metadata' => ['seeded' => true],
                'created_at' => $snag->created_at->copy()->addHours($i + 1),
                'updated_at' => $snag->created_at->copy()->addHours($i + 1),
            ]);
        }
    }

    /**
     * @param  Collection<int, Snag>  $snags
     * @param  array<string, User>  $users
     * @param  Collection<int, StakeholderTeam>  $teams
     */
    private function seedSnagCollaborationData(
        Organization $organization,
        Project $project,
        Collection $snags,
        array $users,
        Collection $teams,
        string $samplePng
    ): void {
        if ($snags->isEmpty()) {
            return;
        }

        $snagIds = $snags->pluck('id')->values();

        SnagWatcher::query()
            ->where('organization_id', $organization->id)
            ->whereIn('snag_id', $snagIds)
            ->delete();

        $teams->each(fn (StakeholderTeam $team) => $team->loadMissing('users'));
        $commenters = collect([$users['project_manager'], $users['engineer'], $users['engineer_2'], $users['inspector']])->filter();
        $watchPool = collect([$users['project_manager'], $users['engineer'], $users['engineer_2'], $users['inspector'], $users['viewer']])->filter();

        foreach ($snags as $snag) {
            $defaultWatchers = collect([$snag->created_by, $snag->assigned_to])
                ->filter()
                ->merge(
                    $watchPool
                        ->shuffle()
                        ->take(fake()->numberBetween(0, 2))
                        ->pluck('id')
                )
                ->unique()
                ->values();

            foreach ($defaultWatchers as $watcherUserId) {
                SnagWatcher::query()->create([
                    'organization_id' => $organization->id,
                    'snag_id' => $snag->id,
                    'user_id' => (int) $watcherUserId,
                    'source' => in_array((int) $watcherUserId, [(int) $snag->created_by, (int) ($snag->assigned_to ?? 0)], true) ? 'assigned' : 'manual',
                    'created_by' => $users['org_admin']->id,
                    'created_at' => Carbon::parse($snag->created_at)->addMinutes(5),
                    'updated_at' => Carbon::parse($snag->created_at)->addMinutes(5),
                ]);
            }

            $comments = SnagComment::query()
                ->where('snag_id', $snag->id)
                ->whereNull('parent_id')
                ->orderBy('created_at')
                ->get();

            foreach ($comments as $commentIndex => $comment) {
                if (fake()->boolean(45)) {
                    $mentionedUser = $commenters
                        ->where('id', '!=', $comment->user_id)
                        ->random();

                    SnagCommentMention::query()->create([
                        'organization_id' => $organization->id,
                        'snag_comment_id' => $comment->id,
                        'mentioned_user_id' => $mentionedUser->id,
                        'mentioned_team_id' => null,
                        'token' => '@user:'.$mentionedUser->id,
                        'meta' => ['source' => 'seed'],
                        'created_at' => Carbon::parse($comment->created_at)->addMinutes(2),
                        'updated_at' => Carbon::parse($comment->created_at)->addMinutes(2),
                    ]);

                    SnagWatcher::query()->firstOrCreate([
                        'organization_id' => $organization->id,
                        'snag_id' => $snag->id,
                        'user_id' => $mentionedUser->id,
                    ], [
                        'source' => 'mention',
                        'created_by' => $comment->user_id,
                    ]);
                }

                if ($teams->isNotEmpty() && fake()->boolean(30)) {
                    /** @var StakeholderTeam $team */
                    $team = $teams->random();

                    SnagCommentMention::query()->create([
                        'organization_id' => $organization->id,
                        'snag_comment_id' => $comment->id,
                        'mentioned_user_id' => null,
                        'mentioned_team_id' => $team->id,
                        'token' => '@team:'.$team->id,
                        'meta' => ['source' => 'seed', 'team' => $team->name],
                        'created_at' => Carbon::parse($comment->created_at)->addMinutes(3),
                        'updated_at' => Carbon::parse($comment->created_at)->addMinutes(3),
                    ]);

                    foreach ($team->users as $teamMember) {
                        SnagWatcher::query()->firstOrCreate([
                            'organization_id' => $organization->id,
                            'snag_id' => $snag->id,
                            'user_id' => $teamMember->id,
                        ], [
                            'source' => 'team_mention',
                            'created_by' => $comment->user_id,
                        ]);
                    }
                }

                if (fake()->boolean(35)) {
                    $path = sprintf(
                        'seed/org_%d/snag_%d/comments/comment_%d_attachment_%d.png',
                        $organization->id,
                        $snag->id,
                        $comment->id,
                        $commentIndex + 1
                    );
                    Storage::disk('public')->put($path, $samplePng);

                    SnagCommentAttachment::query()->create([
                        'organization_id' => $organization->id,
                        'snag_comment_id' => $comment->id,
                        'uploaded_by' => $comment->user_id,
                        'type' => 'photo',
                        'file_name' => basename($path),
                        'file_path' => $path,
                        'mime_type' => 'image/png',
                        'file_size' => strlen($samplePng),
                        'metadata' => ['seeded' => true],
                        'created_at' => Carbon::parse($comment->created_at)->addMinutes(4),
                        'updated_at' => Carbon::parse($comment->created_at)->addMinutes(4),
                    ]);
                }

                if (fake()->boolean(35)) {
                    /** @var User $replyAuthor */
                    $replyAuthor = $commenters->random();
                    $replyCreatedAt = Carbon::parse($comment->created_at)->addHours(fake()->numberBetween(2, 10));

                    $reply = SnagComment::query()->create([
                        'snag_id' => $snag->id,
                        'parent_id' => $comment->id,
                        'organization_id' => $organization->id,
                        'user_id' => $replyAuthor->id,
                        'body' => fake()->randomElement([
                            'Replying with field update and next action.',
                            'Acknowledged, scheduling correction this week.',
                            'Please verify after corrective action is complete.',
                        ]),
                        'is_internal' => fake()->boolean(20),
                        'created_at' => $replyCreatedAt,
                        'updated_at' => $replyCreatedAt,
                    ]);

                    if (fake()->boolean(45)) {
                        $mentionedUser = $commenters
                            ->where('id', '!=', $replyAuthor->id)
                            ->random();

                        SnagCommentMention::query()->create([
                            'organization_id' => $organization->id,
                            'snag_comment_id' => $reply->id,
                            'mentioned_user_id' => $mentionedUser->id,
                            'mentioned_team_id' => null,
                            'token' => '@user:'.$mentionedUser->id,
                            'meta' => ['source' => 'seed_reply'],
                            'created_at' => $replyCreatedAt->copy()->addMinutes(2),
                            'updated_at' => $replyCreatedAt->copy()->addMinutes(2),
                        ]);
                    }
                }
            }
        }
    }

    /**
     * @param  array<string, User>  $users
     * @return Collection<int, CloseoutTemplate>
     */
    private function seedCloseoutTemplates(Organization $organization, Project $project, array $users): Collection
    {
        $trades = ['Architectural', 'MEP', 'Civil'];

        return collect($trades)->map(function (string $trade, int $index) use ($organization, $project, $users) {
            $template = CloseoutTemplate::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => sprintf('%s Closeout - %s', $trade, $project->code),
                ],
                [
                    'trade' => $trade,
                    'discipline' => $trade,
                    'description' => sprintf('%s closeout checklist for %s', $trade, $project->name),
                    'is_default' => $index === 0,
                    'is_active' => true,
                    'is_library' => false,
                    'library_key' => null,
                    'created_by' => $users['project_manager']->id,
                ]
            );

            $template->items()->delete();

            $items = [
                ['title' => 'Work completion verified against latest drawing', 'required' => true, 'evidence_required' => true],
                ['title' => 'Material and product submissions approved', 'required' => true, 'evidence_required' => false],
                ['title' => 'Inspection and test records attached', 'required' => true, 'evidence_required' => true],
                ['title' => 'Area cleaned and handover ready', 'required' => true, 'evidence_required' => true],
                ['title' => 'Punch list signed by responsible engineer', 'required' => false, 'evidence_required' => false],
            ];

            foreach ($items as $itemIndex => $itemData) {
                CloseoutTemplateItem::query()->create([
                    'closeout_template_id' => $template->id,
                    'title' => $itemData['title'],
                    'description' => null,
                    'required' => $itemData['required'],
                    'evidence_required' => $itemData['evidence_required'],
                    'sort_order' => $itemIndex,
                ]);
            }

            return $template->fresh('items');
        });
    }

    /**
     * @param  Collection<int, Snag>  $snags
     * @param  Collection<int, CloseoutTemplate>  $templates
     * @param  array<string, User>  $users
     */
    private function seedCloseoutInstances(
        Organization $organization,
        Project $project,
        Collection $snags,
        Collection $templates,
        array $users,
        string $samplePng
    ): void {
        foreach ($snags as $snag) {
            if ($snag->status !== SnagStatus::Closed->value && fake()->boolean(28)) {
                continue;
            }

            /** @var CloseoutTemplate $template */
            $template = $templates->random();
            $template->loadMissing('items');

            $instance = CloseoutInstance::query()->firstOrNew([
                'snag_id' => $snag->id,
            ]);

            $instance->organization_id = $organization->id;
            $instance->project_id = $project->id;
            $instance->closeout_template_id = $template->id;
            $instance->created_by = $snag->created_by;
            $instance->save();

            $instance->items()->delete();

            foreach ($template->items as $templateItem) {
                $isCompleted = match ($snag->status) {
                    SnagStatus::Closed->value => true,
                    SnagStatus::ReadyForReview->value => fake()->boolean(85),
                    SnagStatus::InProgress->value => fake()->boolean(55),
                    SnagStatus::Assigned->value => fake()->boolean(35),
                    default => fake()->boolean(15),
                };

                if (! $templateItem->required && fake()->boolean(35)) {
                    $isCompleted = false;
                }

                $completedBy = $snag->assigned_to ?: $users['engineer']->id;
                $completedAt = $isCompleted ? $snag->created_at->copy()->addDays(fake()->numberBetween(1, 14)) : null;

                $item = CloseoutInstanceItem::query()->create([
                    'closeout_instance_id' => $instance->id,
                    'closeout_template_item_id' => $templateItem->id,
                    'title' => $templateItem->title,
                    'description' => $templateItem->description,
                    'required' => $templateItem->required,
                    'evidence_required' => $templateItem->evidence_required,
                    'is_completed' => $isCompleted,
                    'completed_at' => $completedAt,
                    'completed_by' => $isCompleted ? $completedBy : null,
                    'notes' => $isCompleted ? fake()->optional()->sentence() : null,
                ]);

                $needsEvidence = $item->evidence_required && ($isCompleted && ($snag->status === SnagStatus::Closed->value || fake()->boolean(70)));
                if ($needsEvidence) {
                    $path = sprintf(
                        'seed/org_%d/closeout/snag_%d/item_%d_%d.png',
                        $organization->id,
                        $snag->id,
                        $item->id,
                        fake()->numberBetween(1, 4)
                    );
                    Storage::disk('public')->put($path, $samplePng);

                    CloseoutEvidence::query()->create([
                        'organization_id' => $organization->id,
                        'closeout_instance_item_id' => $item->id,
                        'uploaded_by' => $completedBy,
                        'file_name' => basename($path),
                        'file_path' => $path,
                        'mime_type' => 'image/png',
                        'file_size' => strlen($samplePng),
                        'metadata' => ['seeded' => true],
                    ]);
                }
            }

            $instance->load('items.evidences');

            $requiredItems = $instance->items->filter(fn (CloseoutInstanceItem $item) => $item->required);
            $requiredCount = $requiredItems->count();

            $satisfied = $requiredItems
                ->filter(function (CloseoutInstanceItem $item): bool {
                    if (! $item->is_completed) {
                        return false;
                    }

                    if (! $item->evidence_required) {
                        return true;
                    }

                    return $item->evidences->isNotEmpty();
                })
                ->count();

            $completion = $requiredCount === 0 ? 100 : (int) round(($satisfied / $requiredCount) * 100);
            $instance->completion_percentage = $completion;
            $instance->completed_at = $completion === 100 ? now()->subHours(fake()->numberBetween(1, 72)) : null;
            $instance->status = $completion === 0 ? 'not_started' : ($completion < 100 ? 'in_progress' : 'completed');
            $instance->reviewed_by = null;
            $instance->reviewed_at = null;

            if ($snag->status === SnagStatus::Closed->value && $completion === 100) {
                $instance->status = 'reviewed';
                $instance->reviewed_by = $users['inspector']->id;
                $instance->reviewed_at = now()->subHours(fake()->numberBetween(1, 48));
            }

            $instance->save();
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedEquipmentAndMaintenance(
        Organization $organization,
        Project $project,
        Collection $locations,
        array $users,
        Collection $snags
    ): void {
        $existingEquipmentIds = Equipment::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->pluck('id');

        if ($existingEquipmentIds->isNotEmpty()) {
            EquipmentMaintenanceLog::query()
                ->whereIn('equipment_id', $existingEquipmentIds)
                ->delete();

            Equipment::query()
                ->whereIn('id', $existingEquipmentIds)
                ->delete();
        }

        $equipmentCount = fake()->numberBetween(8, 14);
        $statusPool = ['ok', 'ok', 'warn', 'critical', 'inactive'];

        for ($i = 1; $i <= $equipmentCount; $i++) {
            /** @var Location $location */
            $location = $locations->random();
            $status = fake()->randomElement($statusPool);

            $equipment = Equipment::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'location_id' => $location->id,
                'code' => sprintf('%s-EQ-%03d', $project->code, $i),
                'name' => fake()->randomElement(['Pump', 'Generator', 'Compressor', 'Panel', 'HVAC Unit', 'Elevator Motor']).' '.$i,
                'category' => fake()->randomElement(['MEP', 'Civil', 'Architectural', 'Safety']),
                'barcode' => sprintf('EQ-%d-%d-%03d', $organization->id, $project->id, $i),
                'serial_number' => strtoupper(fake()->bothify('SN-####-????')),
                'manufacturer' => fake()->randomElement(['Atlas', 'Kone', 'Siemens', 'Daikin', 'ABB']),
                'model' => strtoupper(fake()->bothify('M-##??')),
                'status' => $status,
                'installed_at' => Carbon::now()->subMonths(fake()->numberBetween(2, 20))->toDateString(),
                'last_maintenance_at' => Carbon::now()->subDays(fake()->numberBetween(1, 70)),
                'notes' => fake()->optional()->sentence(),
                'created_by' => $users['project_manager']->id,
            ]);

            $logCount = fake()->numberBetween(1, 4);
            for ($logIndex = 0; $logIndex < $logCount; $logIndex++) {
                /** @var User $performer */
                $performer = collect([$users['project_manager'], $users['engineer'], $users['inspector']])->random();
                $logStatus = fake()->randomElement(['ok', 'ok', 'warn', 'critical']);
                $occurredAt = Carbon::now()->subDays(fake()->numberBetween(1, 120))->subHours(fake()->numberBetween(0, 20));
                $linkedSnag = $snags->isNotEmpty() && fake()->boolean(45) ? $snags->random() : null;

                EquipmentMaintenanceLog::query()->create([
                    'organization_id' => $organization->id,
                    'equipment_id' => $equipment->id,
                    'project_id' => $project->id,
                    'snag_id' => $linkedSnag?->id,
                    'performed_by' => $performer->id,
                    'status' => $logStatus,
                    'description' => fake()->sentence(),
                    'action_taken' => fake()->optional()->sentence(),
                    'occurred_at' => $occurredAt,
                    'next_due_at' => $occurredAt->copy()->addDays(fake()->numberBetween(14, 60)),
                    'metadata' => ['seeded' => true],
                ]);

                if ($linkedSnag && ! $linkedSnag->equipment_id && fake()->boolean(70)) {
                    $linkedSnag->equipment_id = $equipment->id;
                    $linkedSnag->save();
                }
            }
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedNotificationPreferences(Organization $organization, array $users): void
    {
        $preferences = [
            'org_admin' => ['digest' => 'daily', 'push' => true],
            'project_manager' => ['digest' => 'daily', 'push' => true],
            'engineer' => ['digest' => 'weekly', 'push' => true],
            'engineer_2' => ['digest' => 'weekly', 'push' => false],
            'inspector' => ['digest' => 'daily', 'push' => true],
            'viewer' => ['digest' => 'monthly', 'push' => false],
        ];

        foreach ($preferences as $key => $config) {
            $user = $users[$key] ?? null;
            if (! $user) {
                continue;
            }

            NotificationPreference::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'user_id' => $user->id,
                ],
                [
                    'digest_frequency' => $config['digest'],
                    'email_enabled' => true,
                    'in_app_enabled' => true,
                    'push_enabled' => $config['push'],
                    'immediate_assignment' => true,
                    'immediate_status_change' => true,
                    'immediate_comment' => true,
                    'immediate_mention' => true,
                    'immediate_escalation' => true,
                    'approval_needed' => true,
                    'signature_requested' => true,
                    'quiet_hours_start' => '22:00',
                    'quiet_hours_end' => '06:00',
                    'timezone' => 'UTC',
                    'last_daily_sent_at' => null,
                    'last_weekly_sent_at' => null,
                    'last_monthly_sent_at' => null,
                ]
            );

            MobileDeviceToken::query()->updateOrCreate(
                [
                    'user_id' => $user->id,
                    'push_token' => sprintf('ExpoPushToken[%s-%d]', strtolower($organization->code), $user->id),
                ],
                [
                    'organization_id' => $organization->id,
                    'platform' => 'expo',
                    'device_name' => 'Seed Device '.$user->id,
                    'app_version' => '1.0.0',
                    'is_active' => true,
                    'last_seen_at' => Carbon::now()->subHours(fake()->numberBetween(1, 24)),
                ],
            );
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedInspections(
        Organization $organization,
        Project $project,
        array $users,
        string $samplePng,
        int $templateCount,
        int $submissionCount
    ): void {
        $templateCatalog = [
            ['type' => 'ncr', 'name' => 'Non-Conformance Report'],
            ['type' => 'rfi', 'name' => 'Request for Information'],
            ['type' => 'safety', 'name' => 'Safety Inspection'],
            ['type' => 'permit', 'name' => 'Permit Compliance'],
            ['type' => 'commissioning', 'name' => 'Commissioning Verification'],
            ['type' => 'checklist', 'name' => 'Site Checklist'],
            ['type' => 'handover', 'name' => 'Handover Verification'],
            ['type' => 'mir', 'name' => 'Material Inspection Record'],
            ['type' => 'wir', 'name' => 'Work Inspection Record'],
            ['type' => 'ir', 'name' => 'Inspection Request'],
        ];

        $templates = collect();

        for ($i = 0; $i < $templateCount; $i++) {
            $catalog = $templateCatalog[($this->inspectionTemplateCounter - 1) % count($templateCatalog)];
            $templateCode = sprintf('INSP-TPL-%03d', $this->inspectionTemplateCounter);
            $this->inspectionTemplateCounter++;

            $hasOwnerSignOff = ($i % 2) === 0;

            $workflow = [
                [
                    'step_order' => 1,
                    'step_name' => 'Consultant Review',
                    'role_name' => 'inspector',
                    'requires_signature' => false,
                ],
                [
                    'step_order' => 2,
                    'step_name' => 'Project Manager Approval',
                    'role_name' => 'project_manager',
                    'requires_signature' => false,
                ],
            ];

            if ($hasOwnerSignOff) {
                $workflow[] = [
                    'step_order' => 3,
                    'step_name' => 'Owner Sign-Off',
                    'role_name' => 'org_admin',
                    'requires_signature' => true,
                ];
            }

            $template = InspectionTemplate::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'name' => $catalog['name'].' - '.$project->code,
                'code' => $templateCode,
                'type' => $catalog['type'],
                'discipline' => match ($catalog['type']) {
                    'safety' => 'Safety',
                    'permit', 'commissioning', 'handover' => 'MEP',
                    'rfi', 'ncr' => 'Architectural',
                    default => 'QA/QC',
                },
                'description' => $catalog['name'].' form for '.$project->name,
                'schema' => [
                    'sections' => [
                        [
                            'title' => 'General Information',
                            'fields' => [
                                [
                                    'key' => 'area',
                                    'label' => 'Area',
                                    'type' => 'text',
                                    'required' => true,
                                ],
                                [
                                    'key' => 'inspection_date',
                                    'label' => 'Inspection Date',
                                    'type' => 'date',
                                    'required' => true,
                                ],
                                [
                                    'key' => 'inspector_notes',
                                    'label' => 'Inspector Notes',
                                    'type' => 'textarea',
                                    'required' => true,
                                ],
                            ],
                        ],
                        [
                            'title' => 'Checklist',
                            'fields' => [
                                [
                                    'key' => 'severity',
                                    'label' => 'Severity',
                                    'type' => 'select',
                                    'required' => true,
                                    'options' => ['low', 'medium', 'high', 'critical'],
                                ],
                                [
                                    'key' => 'items_count',
                                    'label' => 'Items Checked',
                                    'type' => 'number',
                                    'required' => false,
                                ],
                                [
                                    'key' => 'safe_to_proceed',
                                    'label' => 'Safe to Proceed',
                                    'type' => 'checkbox',
                                    'required' => false,
                                ],
                            ],
                        ],
                    ],
                ],
                'approval_workflow' => $workflow,
                'is_active' => true,
                'is_library' => false,
                'library_key' => null,
                'version' => 1,
                'created_by' => $users['project_manager']->id,
            ]);

            $templates->push($template);
        }

        for ($i = 0; $i < $submissionCount; $i++) {
            /** @var InspectionTemplate $template */
            $template = $templates->random();
            $creator = collect([$users['project_manager'], $users['engineer'], $users['engineer_2']])->random();

            $roll = fake()->numberBetween(1, 100);
            $status = match (true) {
                $roll <= 18 => InspectionSubmission::STATUS_DRAFT,
                $roll <= 35 => InspectionSubmission::STATUS_SUBMITTED,
                $roll <= 58 => InspectionSubmission::STATUS_IN_REVIEW,
                $roll <= 88 => InspectionSubmission::STATUS_APPROVED,
                default => InspectionSubmission::STATUS_REJECTED,
            };

            $createdAt = Carbon::now()->subDays(fake()->numberBetween(1, 60))->subHours(fake()->numberBetween(0, 20));
            $submittedAt = $status === InspectionSubmission::STATUS_DRAFT
                ? null
                : $createdAt->copy()->addHours(fake()->numberBetween(1, 24));

            $submission = InspectionSubmission::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'inspection_template_id' => $template->id,
                'reference' => sprintf('INSP-%05d', $this->inspectionSubmissionCounter++),
                'status' => $status,
                'form_data' => $this->buildInspectionFormData($template),
                'current_approval_order' => null,
                'created_by' => $creator->id,
                'submitted_by' => $submittedAt ? $creator->id : null,
                'submitted_at' => $submittedAt,
                'approved_at' => null,
                'rejected_at' => null,
                'last_updated_by' => $creator->id,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);

            if ($status !== InspectionSubmission::STATUS_DRAFT) {
                $workflow = collect($template->approval_workflow ?? [])
                    ->sortBy('step_order')
                    ->values();

                if ($workflow->isEmpty()) {
                    $workflow = collect([
                        [
                            'step_order' => 1,
                            'step_name' => 'Consultant Review',
                            'role_name' => 'inspector',
                            'requires_signature' => false,
                        ],
                    ]);
                }

                $approvals = collect();

                foreach ($workflow as $step) {
                    $approval = InspectionApproval::query()->create([
                        'organization_id' => $organization->id,
                        'inspection_submission_id' => $submission->id,
                        'step_order' => (int) ($step['step_order'] ?? 1),
                        'step_name' => (string) ($step['step_name'] ?? 'Review Step'),
                        'role_name' => (string) ($step['role_name'] ?? 'inspector'),
                        'requires_signature' => (bool) ($step['requires_signature'] ?? false),
                        'status' => InspectionApproval::STATUS_PENDING,
                        'approver_id' => null,
                        'decision_notes' => null,
                        'acted_at' => null,
                    ]);

                    $approvals->push($approval);
                }

                if ($status === InspectionSubmission::STATUS_SUBMITTED) {
                    $submission->current_approval_order = optional($approvals->sortBy('step_order')->first())->step_order;
                }

                if ($status === InspectionSubmission::STATUS_IN_REVIEW) {
                    $ordered = $approvals->sortBy('step_order')->values();
                    if ($ordered->count() > 1) {
                        /** @var InspectionApproval $first */
                        $first = $ordered->first();
                        $actor = $this->inspectionUserForRole($first->role_name, $users);
                        $first->status = InspectionApproval::STATUS_APPROVED;
                        $first->approver_id = $actor->id;
                        $first->decision_notes = 'Seeded approval progression.';
                        $first->acted_at = $submittedAt?->copy()->addHours(6);
                        $first->save();

                        if ($first->requires_signature) {
                            $signaturePath = sprintf(
                                'seed/org_%d/inspections/submission_%d/signature_step_%d.png',
                                $organization->id,
                                $submission->id,
                                $first->step_order
                            );
                            Storage::disk('public')->put($signaturePath, $samplePng);

                            InspectionSignature::query()->create([
                                'organization_id' => $organization->id,
                                'inspection_submission_id' => $submission->id,
                                'inspection_approval_id' => $first->id,
                                'signed_by' => $actor->id,
                                'context' => 'approval_step',
                                'file_name' => basename($signaturePath),
                                'file_path' => $signaturePath,
                                'mime_type' => 'image/png',
                                'file_size' => strlen($samplePng),
                                'signed_at' => $submittedAt?->copy()->addHours(5) ?? now()->subHours(5),
                                'metadata' => ['seeded' => true],
                            ]);
                        }

                        /** @var InspectionApproval|null $current */
                        $current = $ordered->get(1);
                        $submission->current_approval_order = $current?->step_order;
                    } else {
                        $submission->current_approval_order = optional($ordered->first())->step_order;
                    }
                }

                if ($status === InspectionSubmission::STATUS_APPROVED) {
                    foreach ($approvals->sortBy('step_order') as $index => $approval) {
                        $actor = $this->inspectionUserForRole($approval->role_name, $users);
                        $approval->status = InspectionApproval::STATUS_APPROVED;
                        $approval->approver_id = $actor->id;
                        $approval->decision_notes = 'Approved during seeded workflow.';
                        $approval->acted_at = $submittedAt?->copy()->addHours(4 + ($index * 4));
                        $approval->save();

                        if ($approval->requires_signature || fake()->boolean(35)) {
                            $signaturePath = sprintf(
                                'seed/org_%d/inspections/submission_%d/signature_step_%d.png',
                                $organization->id,
                                $submission->id,
                                $approval->step_order
                            );
                            Storage::disk('public')->put($signaturePath, $samplePng);

                            InspectionSignature::query()->create([
                                'organization_id' => $organization->id,
                                'inspection_submission_id' => $submission->id,
                                'inspection_approval_id' => $approval->id,
                                'signed_by' => $actor->id,
                                'context' => 'approval_step',
                                'file_name' => basename($signaturePath),
                                'file_path' => $signaturePath,
                                'mime_type' => 'image/png',
                                'file_size' => strlen($samplePng),
                                'signed_at' => $submittedAt?->copy()->addHours(3 + ($index * 4)) ?? now()->subHours(3),
                                'metadata' => ['seeded' => true],
                            ]);
                        }
                    }

                    $submission->approved_at = $submittedAt?->copy()->addDays(fake()->numberBetween(1, 5)) ?? now()->subDay();
                    $submission->current_approval_order = null;
                }

                if ($status === InspectionSubmission::STATUS_REJECTED) {
                    $ordered = $approvals->sortBy('step_order')->values();
                    $rejectAt = min(2, $ordered->count()) - 1;

                    foreach ($ordered as $index => $approval) {
                        $actor = $this->inspectionUserForRole($approval->role_name, $users);

                        if ($index < $rejectAt) {
                            $approval->status = InspectionApproval::STATUS_APPROVED;
                            $approval->approver_id = $actor->id;
                            $approval->decision_notes = 'Approved before rejection step.';
                            $approval->acted_at = $submittedAt?->copy()->addHours(4 + ($index * 4));
                            $approval->save();
                            continue;
                        }

                        if ($index === $rejectAt) {
                            $approval->status = InspectionApproval::STATUS_REJECTED;
                            $approval->approver_id = $actor->id;
                            $approval->decision_notes = 'Rejected for corrective action.';
                            $approval->acted_at = $submittedAt?->copy()->addHours(8 + ($index * 4));
                            $approval->save();
                        }
                    }

                    $submission->rejected_at = $submittedAt?->copy()->addDays(fake()->numberBetween(1, 4)) ?? now()->subDay();
                    $submission->current_approval_order = null;
                }

                $submission->save();
            }

            $requestChance = $status === InspectionSubmission::STATUS_DRAFT ? 30 : 68;
            $requestsToCreate = fake()->boolean($requestChance)
                ? (fake()->boolean(25) ? 2 : 1)
                : 0;

            for ($requestIndex = 0; $requestIndex < $requestsToCreate; $requestIndex++) {
                $requestStatus = fake()->randomElement([
                    InspectionRequest::STATUS_REQUESTED,
                    InspectionRequest::STATUS_SCHEDULED,
                    InspectionRequest::STATUS_IN_PROGRESS,
                    InspectionRequest::STATUS_COMPLETED,
                    InspectionRequest::STATUS_REJECTED,
                ]);

                $scheduledFor = in_array($requestStatus, [
                    InspectionRequest::STATUS_SCHEDULED,
                    InspectionRequest::STATUS_IN_PROGRESS,
                    InspectionRequest::STATUS_COMPLETED,
                ], true)
                    ? Carbon::now()->addDays(fake()->numberBetween(1, 12))
                    : null;

                $completedAt = $requestStatus === InspectionRequest::STATUS_COMPLETED
                    ? Carbon::now()->subHours(fake()->numberBetween(1, 72))
                    : null;

                $assignee = collect([$users['inspector'], $users['project_manager'], $users['engineer']])->random();
                $requester = collect([$users['project_manager'], $users['engineer'], $users['engineer_2']])->random();

                InspectionRequest::query()->create([
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'inspection_submission_id' => $submission->id,
                    'reference' => sprintf('REQ-%05d', $this->inspectionRequestCounter++),
                    'request_type' => fake()->randomElement([
                        InspectionRequest::TYPE_MIR,
                        InspectionRequest::TYPE_WIR,
                        InspectionRequest::TYPE_IR,
                    ]),
                    'title' => fake()->randomElement([
                        'Material inspection request',
                        'Work inspection request',
                        'Inspection appointment request',
                        'Verification and closure request',
                    ]),
                    'description' => fake()->optional()->sentence(),
                    'status' => $requestStatus,
                    'requested_by' => $requester->id,
                    'assigned_to' => $assignee->id,
                    'scheduled_for' => $scheduledFor,
                    'completed_at' => $completedAt,
                    'metadata' => ['seeded' => true],
                    'created_at' => $createdAt->copy()->addDays(fake()->numberBetween(0, 8)),
                    'updated_at' => $createdAt->copy()->addDays(fake()->numberBetween(1, 10)),
                ]);
            }
        }
    }

    private function buildInspectionFormData(InspectionTemplate $template): array
    {
        $data = [];
        $sections = collect($template->schema['sections'] ?? []);

        foreach ($sections as $sectionIndex => $section) {
            $fields = collect($section['fields'] ?? []);

            foreach ($fields as $fieldIndex => $field) {
                $key = (string) ($field['key'] ?? 'field_'.$sectionIndex.'_'.$fieldIndex);
                $data[$key] = $this->fakeInspectionFieldValue($field);
            }
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $field
     */
    private function fakeInspectionFieldValue(array $field): mixed
    {
        $type = strtolower((string) ($field['type'] ?? 'text'));
        $options = collect($field['options'] ?? [])->filter()->values();

        return match ($type) {
            'textarea' => fake()->sentence(14),
            'number' => fake()->numberBetween(1, 100),
            'select' => $options->isNotEmpty() ? $options->random() : fake()->randomElement(['low', 'medium', 'high']),
            'date' => Carbon::now()->subDays(fake()->numberBetween(0, 20))->toDateString(),
            'checkbox' => fake()->boolean(),
            default => fake()->words(3, true),
        };
    }

    /**
     * @param  array<string, User>  $users
     */
    private function inspectionUserForRole(string $roleName, array $users): User
    {
        return match ($roleName) {
            'org_admin' => $users['org_admin'],
            'project_manager' => $users['project_manager'],
            'inspector' => $users['inspector'],
            'viewer' => $users['viewer'],
            default => $users['engineer'],
        };
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedInspectionApprovalMessages(Organization $organization, Project $project, array $users): void
    {
        $submissionIds = InspectionSubmission::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->pluck('id');

        if ($submissionIds->isEmpty()) {
            return;
        }

        InspectionApprovalMessage::query()
            ->where('organization_id', $organization->id)
            ->whereIn('inspection_submission_id', $submissionIds)
            ->delete();

        $submissions = InspectionSubmission::query()
            ->whereIn('id', $submissionIds)
            ->with(['approvals', 'submitter', 'creator'])
            ->get();

        foreach ($submissions as $submission) {
            if ($submission->submitted_at) {
                InspectionApprovalMessage::query()->create([
                    'organization_id' => $organization->id,
                    'inspection_submission_id' => $submission->id,
                    'inspection_approval_id' => null,
                    'user_id' => $submission->submitted_by ?: $submission->created_by,
                    'message_type' => 'submitted',
                    'body' => 'Submission entered review workflow.',
                    'payload' => ['status' => $submission->status],
                    'created_at' => Carbon::parse($submission->submitted_at),
                    'updated_at' => Carbon::parse($submission->submitted_at),
                ]);
            }

            foreach ($submission->approvals as $approval) {
                if ($approval->status === InspectionApproval::STATUS_PENDING) {
                    InspectionApprovalMessage::query()->create([
                        'organization_id' => $organization->id,
                        'inspection_submission_id' => $submission->id,
                        'inspection_approval_id' => $approval->id,
                        'user_id' => null,
                        'message_type' => 'step_pending',
                        'body' => sprintf('Step #%d pending: %s', $approval->step_order, $approval->step_name ?: $approval->role_name),
                        'payload' => ['role_name' => $approval->role_name, 'requires_signature' => $approval->requires_signature],
                        'created_at' => Carbon::parse($submission->created_at)->addHours(2),
                        'updated_at' => Carbon::parse($submission->created_at)->addHours(2),
                    ]);
                    continue;
                }

                if ($approval->status === InspectionApproval::STATUS_APPROVED) {
                    InspectionApprovalMessage::query()->create([
                        'organization_id' => $organization->id,
                        'inspection_submission_id' => $submission->id,
                        'inspection_approval_id' => $approval->id,
                        'user_id' => $approval->approver_id,
                        'message_type' => 'decision_approve',
                        'body' => $approval->decision_notes ?: 'Approved during seeded workflow.',
                        'payload' => ['step_order' => $approval->step_order, 'role_name' => $approval->role_name],
                        'created_at' => $approval->acted_at ?: Carbon::parse($submission->created_at)->addHours(4),
                        'updated_at' => $approval->acted_at ?: Carbon::parse($submission->created_at)->addHours(4),
                    ]);
                    continue;
                }

                if ($approval->status === InspectionApproval::STATUS_REJECTED) {
                    InspectionApprovalMessage::query()->create([
                        'organization_id' => $organization->id,
                        'inspection_submission_id' => $submission->id,
                        'inspection_approval_id' => $approval->id,
                        'user_id' => $approval->approver_id,
                        'message_type' => 'decision_reject',
                        'body' => $approval->decision_notes ?: 'Rejected during seeded workflow.',
                        'payload' => ['step_order' => $approval->step_order, 'role_name' => $approval->role_name],
                        'created_at' => $approval->acted_at ?: Carbon::parse($submission->created_at)->addHours(4),
                        'updated_at' => $approval->acted_at ?: Carbon::parse($submission->created_at)->addHours(4),
                    ]);
                }
            }

            InspectionApprovalMessage::query()->create([
                'organization_id' => $organization->id,
                'inspection_submission_id' => $submission->id,
                'inspection_approval_id' => null,
                'user_id' => fake()->boolean(50) ? $users['project_manager']->id : $users['engineer']->id,
                'message_type' => 'comment',
                'body' => fake()->randomElement([
                    'Please align attachments before final sign-off.',
                    'Site team confirmed corrective action is complete.',
                    'Coordinating witness inspection for the next slot.',
                ]),
                'payload' => ['seeded' => true],
                'created_at' => Carbon::parse($submission->created_at)->addHours(6),
                'updated_at' => Carbon::parse($submission->created_at)->addHours(6),
            ]);
        }
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  array<string, User>  $users
     * @param  Collection<int, Snag>  $snags
     */
    private function seedEscalationRulesAndHistory(Organization $organization, Collection $projects, array $users, Collection $snags): void
    {
        SnagEscalationRule::query()
            ->where('organization_id', $organization->id)
            ->where('name', 'like', 'Seed:%')
            ->delete();

        $orgRule = SnagEscalationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => null,
            'name' => 'Seed: Organization overdue escalation',
            'overdue_days' => 3,
            'escalate_to_roles' => ['consultant', 'owner'],
            'cooldown_hours' => 24,
            'is_active' => true,
            'last_evaluated_at' => now()->subHours(6),
            'created_by' => $users['org_admin']->id,
            'updated_by' => $users['org_admin']->id,
        ]);

        $projectRules = collect();
        foreach ($projects as $project) {
            $projectRules->put($project->id, SnagEscalationRule::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'name' => 'Seed: '.$project->code.' consultant escalation',
                'overdue_days' => 5,
                'escalate_to_roles' => ['consultant'],
                'cooldown_hours' => 48,
                'is_active' => true,
                'last_evaluated_at' => now()->subHours(8),
                'created_by' => $users['project_manager']->id,
                'updated_by' => $users['project_manager']->id,
            ]));
        }

        $overdueCandidates = $snags
            ->whereNotIn('status', [SnagStatus::Closed->value, SnagStatus::Rejected->value])
            ->take(20)
            ->values();

        if ($overdueCandidates->isEmpty()) {
            return;
        }

        SnagEscalation::query()
            ->where('organization_id', $organization->id)
            ->whereIn('snag_id', $overdueCandidates->pluck('id'))
            ->delete();

        foreach ($overdueCandidates as $index => $snag) {
            $snag->due_date = Carbon::now()->subDays(fake()->numberBetween(4, 14))->toDateString();
            $snag->save();

            $rule = $projectRules->get($snag->project_id) ?: $orgRule;
            $recipients = collect([$users['project_manager'], $users['org_admin']])
                ->when($index % 3 === 0, fn ($collection) => $collection->push($users['inspector']))
                ->unique('id')
                ->values();

            foreach ($recipients as $recipient) {
                SnagEscalation::query()->create([
                    'organization_id' => $organization->id,
                    'snag_id' => $snag->id,
                    'snag_escalation_rule_id' => $rule->id,
                    'escalated_to_user_id' => $recipient->id,
                    'triggered_by' => null,
                    'escalated_at' => Carbon::parse($snag->due_date)->addDays($rule->overdue_days + 1),
                    'status_at_escalation' => $snag->status,
                    'reason' => 'Seeded overdue escalation',
                    'meta' => ['seeded' => true, 'rule_name' => $rule->name],
                    'created_at' => Carbon::now()->subDays(fake()->numberBetween(1, 7)),
                    'updated_at' => Carbon::now()->subDays(fake()->numberBetween(1, 7)),
                ]);

                SnagWatcher::query()->firstOrCreate([
                    'organization_id' => $organization->id,
                    'snag_id' => $snag->id,
                    'user_id' => $recipient->id,
                ], [
                    'source' => 'escalation',
                    'created_by' => $users['org_admin']->id,
                ]);
            }
        }
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  array<string, User>  $users
     * @param  Collection<int, Snag>  $snags
     */
    private function seedExportJobs(Organization $organization, Collection $projects, array $users, Collection $snags): void
    {
        ExportJob::query()
            ->where('organization_id', $organization->id)
            ->where('requested_by', $users['project_manager']->id)
            ->delete();

        $project = $projects->first();
        $sample = $snags->take(5);

        $csvLines = ['Reference,Title,Status'];
        foreach ($sample as $snag) {
            $csvLines[] = sprintf('"%s","%s","%s"', $snag->reference, str_replace('"', '""', $snag->title), $snag->status);
        }

        $csvPath = sprintf('seed/org_%d/exports/demo_export.csv', $organization->id);
        Storage::disk('public')->put($csvPath, implode("\n", $csvLines));

        ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $users['project_manager']->id,
            'project_id' => $project?->id,
            'type' => 'csv',
            'status' => 'completed',
            'filters' => ['project_id' => $project?->id],
            'file_name' => 'demo_export.csv',
            'file_path' => $csvPath,
            'mime_type' => 'text/csv',
            'download_token' => bin2hex(random_bytes(16)),
            'error_message' => null,
            'completed_at' => now()->subDays(1),
        ]);

        ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $users['engineer']->id,
            'project_id' => $project?->id,
            'type' => 'pdf',
            'status' => 'failed',
            'filters' => ['status' => ['in_progress', 'ready_for_review']],
            'file_name' => null,
            'file_path' => null,
            'mime_type' => null,
            'download_token' => bin2hex(random_bytes(16)),
            'error_message' => 'Template rendering timeout while generating PDF.',
            'completed_at' => now()->subHours(8),
        ]);

        ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $users['org_admin']->id,
            'project_id' => null,
            'type' => 'xlsx',
            'status' => 'queued',
            'filters' => ['priority' => ['high', 'critical']],
            'file_name' => null,
            'file_path' => null,
            'mime_type' => null,
            'download_token' => bin2hex(random_bytes(16)),
            'error_message' => null,
            'completed_at' => null,
        ]);

        ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $users['inspector']->id,
            'project_id' => $project?->id,
            'type' => 'pdf',
            'status' => 'queued',
            'filters' => ['module' => 'inspections', 'project_id' => $project?->id],
            'file_name' => null,
            'file_path' => null,
            'mime_type' => null,
            'download_token' => bin2hex(random_bytes(16)),
            'error_message' => null,
            'completed_at' => null,
        ]);
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedOnboardingProgress(Organization $organization, array $users): void
    {
        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['org_admin']->id,
                'tour_key' => 'core',
            ],
            [
                'current_step' => 5,
                'last_viewed_at' => Carbon::now()->subDay(),
                'completed_at' => Carbon::now()->subDay(),
                'skipped_at' => null,
                'meta' => ['role' => 'org_admin'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['engineer']->id,
                'tour_key' => 'core',
            ],
            [
                'current_step' => 3,
                'last_viewed_at' => Carbon::now()->subHours(6),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'engineer'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['project_manager']->id,
                'tour_key' => 'snags_board',
            ],
            [
                'current_step' => 2,
                'last_viewed_at' => Carbon::now()->subHours(12),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'project_manager'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['inspector']->id,
                'tour_key' => 'closeout',
            ],
            [
                'current_step' => 4,
                'last_viewed_at' => Carbon::now()->subHours(4),
                'completed_at' => Carbon::now()->subHours(4),
                'skipped_at' => null,
                'meta' => ['role' => 'inspector'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['org_admin']->id,
                'tour_key' => 'exports',
            ],
            [
                'current_step' => 1,
                'last_viewed_at' => Carbon::now()->subDays(2),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'org_admin'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['project_manager']->id,
                'tour_key' => 'inspections',
            ],
            [
                'current_step' => 2,
                'last_viewed_at' => Carbon::now()->subHours(18),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'project_manager'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['inspector']->id,
                'tour_key' => 'approvals',
            ],
            [
                'current_step' => 3,
                'last_viewed_at' => Carbon::now()->subHours(10),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'inspector'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['engineer']->id,
                'tour_key' => 'requests',
            ],
            [
                'current_step' => 1,
                'last_viewed_at' => Carbon::now()->subHours(9),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'engineer'],
            ]
        );

        OnboardingTourProgress::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $users['project_manager']->id,
                'tour_key' => 'automation',
            ],
            [
                'current_step' => 1,
                'last_viewed_at' => Carbon::now()->subHours(7),
                'completed_at' => null,
                'skipped_at' => null,
                'meta' => ['role' => 'project_manager'],
            ]
        );
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  array<string, User>  $users
     */
    private function seedOpsControlsAndReliabilityData(Organization $organization, Collection $projects, array $users): void
    {
        OrganizationUsageLimit::query()->updateOrCreate(
            ['organization_id' => $organization->id],
            [
                'storage_quota_mb' => $organization->code === 'ORG-APX' ? 3072 : 5120,
                'max_exports_per_day' => $organization->code === 'ORG-APX' ? 40 : 100,
                'max_users' => 250,
                'meta' => [
                    'seeded' => true,
                    'source' => 'DemoDataSeeder',
                ],
                'updated_by' => $users['org_admin']->id,
            ],
        );

        $orgFlagOverrides = [
            'drawings' => true,
            'kanban' => true,
            'dashboard' => true,
            'exports' => true,
            'inspections' => true,
            'equipment' => true,
            'automation' => $organization->code !== 'ORG-APX',
            'mobile' => true,
        ];

        foreach ($orgFlagOverrides as $featureKey => $isEnabled) {
            OrganizationFeatureFlag::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => null,
                    'feature_key' => $featureKey,
                ],
                [
                    'is_enabled' => $isEnabled,
                    'meta' => ['seeded' => true, 'scope' => 'organization'],
                    'updated_by' => $users['org_admin']->id,
                ],
            );
        }

        $firstProject = $projects->first();
        if ($firstProject) {
            $projectOverrides = [
                'exports' => false,
                'equipment' => $organization->code !== 'ORG-SKY',
                'mobile' => true,
            ];

            foreach ($projectOverrides as $featureKey => $isEnabled) {
                OrganizationFeatureFlag::query()->updateOrCreate(
                    [
                        'organization_id' => $organization->id,
                        'project_id' => $firstProject->id,
                        'feature_key' => $featureKey,
                    ],
                    [
                        'is_enabled' => $isEnabled,
                        'meta' => ['seeded' => true, 'scope' => 'project'],
                        'updated_by' => $users['project_manager']->id,
                    ],
                );
            }
        }

        $orgSuffix = strtolower(str_replace('ORG-', '', $organization->code));
        $inviteSeeds = [
            [
                'email' => "pending.ops.{$orgSuffix}@demo.local",
                'status' => 'pending',
                'invited_by' => $users['org_admin']->id,
                'expires_at' => Carbon::now()->addDays(7),
                'accepted_at' => null,
            ],
            [
                'email' => "accepted.ops.{$orgSuffix}@demo.local",
                'status' => 'accepted',
                'invited_by' => $users['project_manager']->id,
                'expires_at' => Carbon::now()->addDays(3),
                'accepted_at' => Carbon::now()->subDay(),
            ],
            [
                'email' => "expired.ops.{$orgSuffix}@demo.local",
                'status' => 'expired',
                'invited_by' => $users['project_manager']->id,
                'expires_at' => Carbon::now()->subDay(),
                'accepted_at' => null,
            ],
        ];

        foreach ($inviteSeeds as $seed) {
            OrganizationInvite::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'email' => $seed['email'],
                ],
                [
                    'token' => bin2hex(random_bytes(32)),
                    'status' => $seed['status'],
                    'invited_by' => $seed['invited_by'],
                    'invited_at' => Carbon::now()->subDays(3),
                    'last_sent_at' => Carbon::now()->subHours(6),
                    'send_count' => $seed['status'] === 'pending' ? 2 : 1,
                    'expires_at' => $seed['expires_at'],
                    'accepted_at' => $seed['accepted_at'],
                    'meta' => ['seeded' => true],
                ],
            );
        }

        $users['engineer']->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => 'seed-mfa-'.$organization->id.'-engineer',
            'mfa_recovery_codes' => ['OPS-ENG-1', 'OPS-ENG-2', 'OPS-ENG-3'],
            'mfa_reset_at' => null,
        ])->save();

        $users['inspector']->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => 'seed-mfa-'.$organization->id.'-inspector',
            'mfa_recovery_codes' => ['OPS-INSP-1', 'OPS-INSP-2', 'OPS-INSP-3'],
            'mfa_reset_at' => null,
        ])->save();

        for ($index = 0; $index < 36; $index++) {
            $status = fake()->randomElement(['applied', 'applied', 'applied', 'rejected', 'failed']);
            MobileSyncOperationLog::query()->create([
                'organization_id' => $organization->id,
                'user_id' => fake()->randomElement([$users['engineer']->id, $users['engineer_2']->id]),
                'op_id' => (string) fake()->uuid(),
                'operation_type' => fake()->randomElement(['snag.create', 'snag.update', 'snag.transition', 'snag.comment.create']),
                'status' => $status,
                'source' => 'apply',
                'error_code' => $status === 'applied' ? null : 'sync_error',
                'error_message' => $status === 'applied' ? null : fake()->sentence(),
                'payload' => ['seeded' => true, 'index' => $index],
                'occurred_at' => Carbon::now()->subHours(fake()->numberBetween(0, 48)),
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ]);
        }

        for ($index = 0; $index < 6; $index++) {
            OpsHealthEvent::query()->create([
                'organization_id' => $organization->id,
                'event_type' => 'storage_failure',
                'severity' => fake()->randomElement(['warning', 'error', 'critical']),
                'source' => fake()->randomElement([
                    'drawing_revision',
                    'snag_attachment',
                    'snag_comment_attachment',
                    'closeout_evidence',
                    'inspection_signature',
                    'mobile_chunked_upload',
                ]),
                'message' => fake()->sentence(),
                'context' => ['seeded' => true, 'index' => $index],
                'occurred_at' => Carbon::now()->subHours(fake()->numberBetween(0, 72)),
            ]);
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedWorkflowAutomationAndRecurring(
        Organization $organization,
        Collection $projects,
        array $users,
        array $teamsByProject,
    ): void {
        foreach ($projects as $project) {
            /** @var Collection<int, StakeholderTeam> $projectTeams */
            $projectTeams = collect($teamsByProject[$project->id] ?? []);

            /** @var StakeholderTeam|null $contractorTeam */
            $contractorTeam = $projectTeams
                ->first(fn (StakeholderTeam $team) => str_contains(strtolower($team->name), 'contractor'));

            $assignmentActions = [
                'due_in_hours' => 48,
            ];

            if ($contractorTeam) {
                $assignmentActions['assign_team_id'] = $contractorTeam->id;
                if ($contractorTeam->company_id) {
                    $assignmentActions['assign_company_id'] = $contractorTeam->company_id;
                }
            }

            WorkflowAutomationRule::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Seed: '.$project->code.' electrical high priority automation',
                ],
                [
                    'description' => 'Seeded rule: high-priority electrical snag assignment and 48h due date.',
                    'trigger_event' => WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
                    'conditions' => [
                        'trade' => ['Electrical'],
                        'priority' => ['high', 'critical'],
                    ],
                    'actions' => $assignmentActions,
                    'priority' => 20,
                    'run_once_per_snag' => false,
                    'is_active' => true,
                    'created_by' => $users['project_manager']->id,
                    'updated_by' => $users['project_manager']->id,
                ],
            );

            WorkflowAutomationRule::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Seed: '.$project->code.' rejected twice escalation automation',
                ],
                [
                    'description' => 'Seeded rule: escalate when a snag is rejected twice.',
                    'trigger_event' => WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED,
                    'conditions' => [
                        'status' => [SnagStatus::Rejected->value],
                        'status_changed_to' => [SnagStatus::Rejected->value],
                        'rejection_count_gte' => 2,
                    ],
                    'actions' => [
                        'escalate_to_roles' => ['consultant', 'owner'],
                    ],
                    'priority' => 35,
                    'run_once_per_snag' => true,
                    'is_active' => true,
                    'created_by' => $users['project_manager']->id,
                    'updated_by' => $users['project_manager']->id,
                ],
            );

            SnagReminderPolicy::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'name' => 'Seed: '.$project->code.' assignee reminder policy',
                ],
                [
                    'statuses' => [SnagStatus::Assigned->value, SnagStatus::InProgress->value],
                    'reminder_every_hours' => 12,
                    'max_reminders' => 6,
                    'is_active' => true,
                    'created_by' => $users['project_manager']->id,
                    'updated_by' => $users['project_manager']->id,
                ],
            );

            $template = InspectionTemplate::query()
                ->where('organization_id', $organization->id)
                ->where('project_id', $project->id)
                ->where('is_active', true)
                ->orderBy('id')
                ->first();

            if ($template) {
                InspectionRecurringSchedule::query()->updateOrCreate(
                    [
                        'organization_id' => $organization->id,
                        'project_id' => $project->id,
                        'inspection_template_id' => $template->id,
                        'name' => 'Seed: '.$project->code.' weekly recurring inspection',
                    ],
                    [
                        'recurrence' => InspectionRecurringSchedule::RECURRENCE_WEEKLY,
                        'interval_value' => 1,
                        'starts_at' => Carbon::now()->subDays(20)->setTime(8, 0),
                        'ends_at' => null,
                        'next_run_at' => Carbon::now()->addDays(fake()->numberBetween(1, 5))->setTime(8, 0),
                        'run_time' => '08:00',
                        'timezone' => 'UTC',
                        'default_form_data' => [
                            'auto_generated' => true,
                            'source' => 'seed_recurring_schedule',
                        ],
                        'assign_to_user_id' => $users['inspector']->id,
                        'is_active' => true,
                        'created_by' => $users['project_manager']->id,
                        'updated_by' => $users['project_manager']->id,
                    ],
                );
            }
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedDashboardConfigs(Organization $organization, array $users): void
    {
        $configDefinitions = [
            [
                'user' => 'project_manager',
                'name' => 'Operations SLA View',
                'cards' => ['total_snags', 'open_snags', 'overdue_snags', 'avg_ack_hours', 'avg_fix_hours', 'avg_close_hours'],
                'filters' => ['status' => ['new', 'assigned', 'in_progress', 'ready_for_review']],
                'is_default' => true,
            ],
            [
                'user' => 'org_admin',
                'name' => 'Cost and Pareto View',
                'cards' => ['total_snags', 'cost_total', 'effort_total', 'avg_closure_days'],
                'filters' => ['priority' => ['high', 'critical']],
                'is_default' => true,
            ],
            [
                'user' => 'engineer',
                'name' => 'Trade Forecast View',
                'cards' => ['open_snags', 'overdue_snags', 'avg_fix_hours'],
                'filters' => ['status' => ['assigned', 'in_progress', 'ready_for_review']],
                'is_default' => true,
            ],
        ];

        foreach ($configDefinitions as $definition) {
            $user = $users[$definition['user']] ?? null;
            if (! $user) {
                continue;
            }

            DashboardConfig::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'user_id' => $user->id,
                    'name' => $definition['name'],
                ],
                [
                    'is_default' => (bool) $definition['is_default'],
                    'cards' => $definition['cards'],
                    'filters' => $definition['filters'],
                    'layout' => null,
                ],
            );
        }
    }
}

