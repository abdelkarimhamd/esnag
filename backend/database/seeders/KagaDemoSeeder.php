<?php

namespace Database\Seeders;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\CommissioningPack;
use App\Models\CommissioningWitnessSignoff;
use App\Models\Drawing;
use App\Models\DrawingRevision;
use App\Models\Equipment;
use App\Models\EquipmentMaintenanceLog;
use App\Models\Floor;
use App\Models\InspectionApproval;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\ProjectUserRole;
use App\Models\PunchList;
use App\Models\Snag;
use App\Models\SnagStatusHistory;
use App\Models\StakeholderCompany;
use App\Models\TakingOverCertificate;
use App\Models\TocSignature;
use App\Models\User;
use App\Services\HandoverRequestService;
use App\Services\HandoverRoutingService;
use App\Services\TocService;
use App\Support\HandoverActions;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

use function setPermissionsTeamId;

/**
 * KagaDemoSeeder
 *
 * Primary demo seeder for the eSnag platform, built from the real "Advanced
 * Gardens (KAGA) — Riyadh" site data in database/seeders/data/kaga.json.
 *
 * Mirrors the working patterns established in DemoDataSeeder: one org-scoped
 * organization, demo users with org-level + project-level roles, a project with
 * a Building -> Floor -> Location hierarchy, drawings + revisions, snags with
 * reference sequencing / pin_x / pin_y / status history, equipment + maintenance
 * logs, and inspection templates / submissions / requests using the same
 * status-aware form_data approach so completion_percent reads sensibly.
 */
class KagaDemoSeeder extends Seeder
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
BT /F1 18 Tf 20 120 Td (eSnagging KAGA Revision) Tj ET
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

        $data = json_decode(file_get_contents(database_path('seeders/data/kaga.json')), true);
        $projectMeta = $data['project'] ?? [];
        $assets = $data['assets'] ?? [];
        $snagRows = $data['snags'] ?? [];
        $planRows = $data['plan'] ?? [];

        $organization = Organization::query()->updateOrCreate(
            ['code' => 'KAGA'],
            [
                'name' => 'Advanced Gardens (KAGA) — Riyadh',
                'description' => sprintf(
                    'Riyadh Region Municipality. %s. Block %s / Week %s. RAG: %s.',
                    $this->clean($projectMeta['phase'] ?? 'Pre-opening / Soft Launch'),
                    $this->clean($projectMeta['block'] ?? 'BL05'),
                    $this->clean($projectMeta['week'] ?? 'W355'),
                    $this->clean($projectMeta['rag'] ?? 'Green'),
                ),
            ]
        );

        RbacSeeder::seedRolesForOrganization($organization);

        $users = $this->seedUsers($organization);

        $project = $this->seedProject($organization, $projectMeta);

        $hierarchy = $this->seedHierarchy($organization, $project, $snagRows, $assets);
        $drawing = $this->seedDrawing($organization, $project, $hierarchy, $users, $samplePng, $samplePdf);

        $this->seedProjectRoles($organization, $project, $users);

        $snags = $this->seedSnags($organization, $project, $drawing, $hierarchy, $users, $snagRows, $samplePng);
        $this->seedEquipment($organization, $project, $hierarchy, $users, $snags, $assets);
        $this->seedInspections($organization, $project, $users, $samplePng);
        $this->seedInspectionRequests($organization, $project, $users, $planRows);
        $this->seedCommissioningAndHandover($organization, $project, $users, $snags);
        $this->seedHandover($organization, $project, $users);
        $this->seedMultiPartyHandover($organization, $project, $hierarchy, $snags);
    }

    /**
     * The multi-party handover ROUTING demo (BRD §6.3, ADR-001). Seeds the six
     * BRD parties as StakeholderCompany rows with a login per party, then drives
     * a couple of HandoverRequests part-way through the cross-party cycle so the
     * routing board, take-action panel, consolidation and closure all demo
     * end-to-end. The 12-stage blueprint and roster reflect the current plausible
     * defaults pending OD-01/OD-02/OD-05.
     */
    private function seedMultiPartyHandover(Organization $organization, Project $project, array $hierarchy, Collection $snags): void
    {
        setPermissionsTeamId($organization->id);

        $parties = [
            ['code' => 'ZAIDG', 'name' => 'ZAIDG Contracting', 'type' => 'contractor', 'role' => 'contractor_submitter', 'email' => 'zaidg@kaga.demo', 'person' => 'ZAIDG Site Lead'],
            ['code' => 'DAR', 'name' => 'DAR Al-Handasah (Consultant)', 'type' => 'consultant', 'role' => 'consultant_reviewer', 'email' => 'dar@kaga.demo', 'person' => 'DAR Reviewer'],
            ['code' => 'AMANA', 'name' => 'Amanat Ar-Riyadh (Authority)', 'type' => 'authority', 'role' => 'authority_reviewer', 'email' => 'amana@kaga.demo', 'person' => 'Amana Officer'],
            ['code' => 'AGDN', 'name' => 'Advanced Gardens (Owner)', 'type' => 'owner', 'role' => 'owner_reviewer', 'email' => 'gardens@kaga.demo', 'person' => 'Advanced Gardens Owner'],
            ['code' => 'MRG', 'name' => 'Morganti (FMMP)', 'type' => 'fmmp', 'role' => 'fmmp_coordinator', 'email' => 'morganti@kaga.demo', 'person' => 'Morganti Coordinator'],
            ['code' => 'JASH', 'name' => 'JASH Facilities (Service Provider)', 'type' => 'service_provider', 'role' => 'service_provider_inspector', 'email' => 'jash@kaga.demo', 'person' => 'JASH Inspector'],
        ];

        $partyUser = [];
        foreach ($parties as $party) {
            $company = StakeholderCompany::query()->updateOrCreate(
                ['organization_id' => $organization->id, 'code' => $party['code']],
                ['name' => $party['name'], 'type' => $party['type'], 'is_active' => true]
            );

            $user = User::query()->updateOrCreate(
                ['email' => $party['email']],
                ['name' => $party['person'], 'password' => 'password', 'email_verified_at' => Carbon::now()]
            );

            $organization->users()->syncWithoutDetaching([
                $user->id => ['is_active' => true, 'job_title' => $party['name'], 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ]);

            DB::table('company_user')->updateOrInsert(
                ['organization_id' => $organization->id, 'company_id' => $company->id, 'user_id' => $user->id],
                ['is_active' => true, 'is_primary' => true, 'updated_at' => Carbon::now(), 'created_at' => Carbon::now()]
            );

            setPermissionsTeamId($organization->id);
            $user->syncRoles($party['role']);
            $partyUser[$party['type']] = $user;
        }

        /** @var Building|null $building */
        $building = $hierarchy['buildings']->first();
        $buildingId = $building?->id;
        $areaId = $building?->area_id;
        $snagIds = $snags->take(3)->pluck('id')->values()->all();

        $requestService = app(HandoverRequestService::class);
        $routing = app(HandoverRoutingService::class);

        // Request A — driven to the FMMP coordination stage (mid-cycle).
        try {
            $requestA = $requestService->create($partyUser['contractor'], $organization->id, $project->id, [
                'title' => 'Energy Centre — Block BL05 handover',
                'description' => 'Cross-party handover of the Energy Centre package for review and acceptance.',
                'area_id' => $areaId,
                'building_id' => $buildingId,
            ]);
            if ($snagIds !== []) {
                $requestService->attachSnags($partyUser['contractor'], $requestA, $snagIds, false);
            }
            $requestA = $routing->submit($requestA->fresh(), $partyUser['contractor']); // → stage 2 (consultant)
            foreach (['consultant', 'authority', 'owner'] as $type) {
                $requestA = $routing->act($requestA->fresh(), $partyUser[$type], HandoverActions::FORWARD);
            }
        } catch (\Throwable $exception) {
            // A gated stage simply leaves the request where it advanced to — still a valid mid-cycle demo.
        }

        // Request B — left at the first review stage (awaiting the consultant).
        try {
            $requestB = $requestService->create($partyUser['contractor'], $organization->id, $project->id, [
                'title' => 'Chiller Plant — Block BL05 handover',
                'description' => 'Handover of the chiller plant package; awaiting consultant review.',
                'area_id' => $areaId,
                'building_id' => $buildingId,
            ]);
            if ($snagIds !== []) {
                $requestService->attachSnags($partyUser['contractor'], $requestB, $snagIds, false);
            }
            $routing->submit($requestB->fresh(), $partyUser['contractor']); // → stage 2 (consultant)
        } catch (\Throwable $exception) {
            // Leave as draft if submission is gated.
        }
    }

    /**
     * Handover / Taking-Over Certificate demo layer. Three certificates at
     * different lifecycle stages — signed (DLP running), issued (awaiting
     * signature) and closed (final acceptance) — bound by reference to the
     * punch lists and DLP snags already seeded above.
     */
    private function seedHandover(Organization $organization, Project $project, array $users): void
    {
        $manager = $users['project_manager'];
        $admin = $users['org_admin'];
        $tocService = app(TocService::class);

        // TOC-KG001 — signed, DLP active (~10 months remaining).
        $signedDate = Carbon::today()->subMonths(2);
        $signed = TakingOverCertificate::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'reference' => 'TOC-KG001'],
            [
                'project_id' => $project->id,
                'title' => 'Taking-Over Certificate — Block 05',
                'scope_type' => TakingOverCertificate::SCOPE_SECTION,
                'zone' => 'Block 05',
                'description' => 'Sectional taking-over of Block 05 for the pre-opening soft launch.',
                'status' => TakingOverCertificate::STATUS_SIGNED,
                'taking_over_date' => $signedDate,
                'dlp_months' => 12,
                'dlp_end_date' => $signedDate->copy()->addMonths(12),
                'employer_name' => 'Riyadh Region Municipality',
                'contractor_name' => 'Advanced Gardens JV',
                'engineer_name' => 'Morganti Consulting',
                'required_signatory_roles' => ['contractor', 'consultant', 'client'],
                'issued_at' => $signedDate->copy()->subDays(3),
                'signed_at' => $signedDate,
                'created_by' => $manager->id,
            ]
        );
        $tocService->seedDocumentPack($signed);
        // Provide most of the pack, leave one required item outstanding.
        $signed->documentItems()->where('required', true)->take(4)->get()->each(function ($item) use ($manager): void {
            $item->update(['is_provided' => true, 'provided_at' => now()->subDays(5), 'provided_by' => $manager->id]);
        });
        foreach (['contractor' => $manager, 'consultant' => $admin, 'client' => $admin] as $role => $signer) {
            TocSignature::query()->firstOrCreate(
                ['taking_over_certificate_id' => $signed->id, 'context' => TakingOverCertificate::CONTEXT_TAKING_OVER, 'role' => $role],
                ['organization_id' => $organization->id, 'signed_by' => $signer->id, 'signed_at' => $signedDate, 'notes' => ucfirst($role).' signed the taking-over certificate.']
            );
        }
        $tocService->syncLinkedRecords($signed);

        // TOC-KG002 — issued, awaiting signatures.
        $issued = TakingOverCertificate::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'reference' => 'TOC-KG002'],
            [
                'project_id' => $project->id,
                'title' => 'Sectional Handover — Energy Centre',
                'scope_type' => TakingOverCertificate::SCOPE_SECTION,
                'zone' => 'Energy Centre',
                'system_type' => 'MEP',
                'description' => 'Energy Centre sectional handover, circulated for signature.',
                'status' => TakingOverCertificate::STATUS_ISSUED,
                'taking_over_date' => Carbon::today()->subDays(6),
                'dlp_months' => 12,
                'employer_name' => 'Riyadh Region Municipality',
                'contractor_name' => 'Advanced Gardens JV',
                'engineer_name' => 'Morganti Consulting',
                'required_signatory_roles' => ['contractor', 'consultant', 'client'],
                'issued_at' => Carbon::today()->subDays(5),
                'created_by' => $manager->id,
            ]
        );
        $tocService->seedDocumentPack($issued);
        $tocService->syncLinkedRecords($issued);

        // TOC-KG003 — closed (final acceptance complete), a fully handed-over zone.
        $closedTakingOver = Carbon::today()->subMonths(14);
        $closed = TakingOverCertificate::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'reference' => 'TOC-KG003'],
            [
                'project_id' => $project->id,
                'title' => 'Taking-Over Certificate — Gardens Zone',
                'scope_type' => TakingOverCertificate::SCOPE_SECTION,
                'zone' => 'Gardens',
                'description' => 'Landscaping / gardens zone — DLP elapsed and final acceptance issued.',
                'status' => TakingOverCertificate::STATUS_CLOSED,
                'taking_over_date' => $closedTakingOver,
                'dlp_months' => 12,
                'dlp_end_date' => $closedTakingOver->copy()->addMonths(12),
                'employer_name' => 'Riyadh Region Municipality',
                'contractor_name' => 'Advanced Gardens JV',
                'engineer_name' => 'Morganti Consulting',
                'required_signatory_roles' => ['contractor', 'consultant', 'client'],
                'issued_at' => $closedTakingOver->copy()->subDays(3),
                'signed_at' => $closedTakingOver,
                'final_acceptance_at' => $closedTakingOver->copy()->addMonths(12)->addDays(5),
                'final_acceptance_reference' => 'FAC-KG003',
                'final_acceptance_notes' => 'All DLP defects rectified; final acceptance issued.',
                'created_by' => $manager->id,
            ]
        );
        $tocService->seedDocumentPack($closed);
        $closed->documentItems()->update(['is_provided' => true, 'provided_at' => now()->subMonths(1), 'provided_by' => $manager->id]);
        foreach (['taking_over', 'final_acceptance'] as $context) {
            foreach (['contractor' => $manager, 'consultant' => $admin, 'client' => $admin] as $role => $signer) {
                TocSignature::query()->firstOrCreate(
                    ['taking_over_certificate_id' => $closed->id, 'context' => $context, 'role' => $role],
                    ['organization_id' => $organization->id, 'signed_by' => $signer->id, 'signed_at' => $closedTakingOver, 'notes' => ucfirst($role).' signed ('.$context.').']
                );
            }
        }
        $tocService->syncLinkedRecords($closed);
    }

    /**
     * T&C + handover demo layer: three commissioning packs at different stages
     * (in progress, awaiting witness, completed) and two punch lists — one
     * issued against the TOC-KG001 taking-over reference, one still draft.
     */
    private function seedCommissioningAndHandover(Organization $organization, Project $project, array $users, $snags): void
    {
        $manager = $users['project_manager'];
        $inspector = $users['inspector'];
        $admin = $users['org_admin'];

        $template = InspectionTemplate::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'code' => 'KAGA-COMM-ITR'],
            [
                'project_id' => $project->id,
                'name' => 'Commissioning Test Record',
                'type' => 'commissioning',
                'description' => 'Functional / performance test record used inside commissioning packs.',
                'schema' => ['sections' => [[
                    'title' => 'Functional checks',
                    'fields' => [
                        ['key' => 'power_on', 'label' => 'Power-on & controls check', 'type' => 'result'],
                        ['key' => 'safety_devices', 'label' => 'Safety devices operational', 'type' => 'result'],
                        ['key' => 'design_duty', 'label' => 'Runs at design duty', 'type' => 'result'],
                    ],
                ]]],
                'is_active' => true,
                'created_by' => $manager->id,
            ]
        );

        $packDefinitions = [
            [
                'code' => 'CP-001',
                'name' => 'Chiller Plant — System 1',
                'system_type' => 'HVAC',
                'zone' => 'Chiller Plant',
                'stage' => CommissioningPack::STAGE_COMMISSIONING,
                'equipment_like' => ['chiller'],
                // pre-comm fully passed; commissioning stage half done.
                'itrs' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_SUBMITTED],
                ],
                'witness' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'role' => 'contractor'],
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'role' => 'consultant'],
                ],
            ],
            [
                'code' => 'CP-002',
                'name' => 'Energy Centre LV & MDP',
                'system_type' => 'Electrical',
                'zone' => 'Energy Centre',
                'stage' => CommissioningPack::STAGE_PRE_COMMISSIONING,
                'equipment_like' => ['distribution', 'panel', 'mdp'],
                // ITRs approved but the witness chain is incomplete → "awaiting witness".
                'itrs' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                ],
                'witness' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'role' => 'contractor'],
                ],
            ],
            [
                'code' => 'CP-003',
                'name' => 'RO / STP Water Package',
                'system_type' => 'Water & Utilities',
                'zone' => 'Water & Utilities',
                'stage' => CommissioningPack::STAGE_COMPLETED,
                'equipment_like' => ['ro ', 'stp', 'tank'],
                'itrs' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_COMMISSIONING, 'status' => InspectionSubmission::STATUS_APPROVED],
                    ['stage' => CommissioningPack::STAGE_PERFORMANCE, 'status' => InspectionSubmission::STATUS_APPROVED],
                ],
                'witness' => [
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'role' => 'contractor'],
                    ['stage' => CommissioningPack::STAGE_PRE_COMMISSIONING, 'role' => 'consultant'],
                    ['stage' => CommissioningPack::STAGE_COMMISSIONING, 'role' => 'contractor'],
                    ['stage' => CommissioningPack::STAGE_COMMISSIONING, 'role' => 'consultant'],
                    ['stage' => CommissioningPack::STAGE_PERFORMANCE, 'role' => 'contractor'],
                    ['stage' => CommissioningPack::STAGE_PERFORMANCE, 'role' => 'consultant'],
                ],
            ],
        ];

        foreach ($packDefinitions as $definition) {
            $pack = CommissioningPack::query()->updateOrCreate(
                ['organization_id' => $organization->id, 'code' => $definition['code']],
                [
                    'project_id' => $project->id,
                    'name' => $definition['name'],
                    'system_type' => $definition['system_type'],
                    'zone' => $definition['zone'],
                    'stage' => $definition['stage'],
                    'required_witness_roles' => CommissioningPack::DEFAULT_WITNESS_ROLES,
                    'completed_at' => $definition['stage'] === CommissioningPack::STAGE_COMPLETED ? Carbon::now()->subDays(4) : null,
                    'created_by' => $manager->id,
                ]
            );

            // Link matching KAGA assets by name.
            $needles = $definition['equipment_like'];
            $equipmentIds = Equipment::query()
                ->where('organization_id', $organization->id)
                ->where(function ($builder) use ($needles): void {
                    foreach ($needles as $needle) {
                        $builder->orWhere('name', 'like', "%{$needle}%");
                    }
                })
                ->limit(4)
                ->pluck('id')
                ->all();
            $pack->equipment()->syncWithoutDetaching($equipmentIds);

            foreach ($definition['itrs'] as $index => $itr) {
                InspectionSubmission::query()->updateOrCreate(
                    [
                        'organization_id' => $organization->id,
                        'reference' => sprintf('%s-ITR-%02d', $definition['code'], $index + 1),
                    ],
                    [
                        'project_id' => $project->id,
                        'inspection_template_id' => $template->id,
                        'commissioning_pack_id' => $pack->id,
                        'commissioning_stage' => $itr['stage'],
                        'status' => $itr['status'],
                        'form_data' => [
                            'power_on' => 'pass',
                            'safety_devices' => 'pass',
                            'design_duty' => $itr['status'] === InspectionSubmission::STATUS_APPROVED ? 'pass' : null,
                        ],
                        'created_by' => $inspector->id,
                        'submitted_by' => $inspector->id,
                        'submitted_at' => Carbon::now()->subDays(6 - $index),
                        'approved_at' => $itr['status'] === InspectionSubmission::STATUS_APPROVED ? Carbon::now()->subDays(5 - $index) : null,
                    ]
                );
            }

            foreach ($definition['witness'] as $signoff) {
                CommissioningWitnessSignoff::query()->firstOrCreate(
                    [
                        'commissioning_pack_id' => $pack->id,
                        'stage' => $signoff['stage'],
                        'role' => $signoff['role'],
                    ],
                    [
                        'organization_id' => $organization->id,
                        'signed_by' => $signoff['role'] === 'consultant' ? $admin->id : $manager->id,
                        'signed_at' => Carbon::now()->subDays(5),
                        'notes' => sprintf('%s witnessed on site.', ucfirst($signoff['role'])),
                    ]
                );
            }
        }

        // ---- Punch lists (outstanding works bound to the TOC reference) ----
        $snagPool = collect($snags)->filter(fn ($snag) => $snag instanceof Snag);

        $issuedList = PunchList::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'title' => 'Outstanding works — TOC-KG001'],
            [
                'project_id' => $project->id,
                'description' => 'Defects accompanying the Taking-Over Certificate for Block 05 (soft launch).',
                'toc_reference' => 'TOC-KG001',
                'status' => PunchList::STATUS_ISSUED,
                'issued_at' => Carbon::now()->subDays(3),
                'created_by' => $manager->id,
            ]
        );
        $issuedSnags = $snagPool
            ->filter(fn (Snag $snag) => $snag->status !== SnagStatus::Closed->value)
            ->sortByDesc(fn (Snag $snag) => [$snag->is_dlp, $snag->priority === 'critical'])
            ->take(8);
        $issuedList->snags()->syncWithoutDetaching(
            $issuedSnags->mapWithKeys(fn (Snag $snag) => [$snag->id => ['added_by' => $manager->id]])->all()
        );

        $draftList = PunchList::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'title' => 'Energy Centre pre-handover items'],
            [
                'project_id' => $project->id,
                'description' => 'Energy Centre walk-down list ahead of the sectional taking-over.',
                'toc_reference' => 'TOC-KG002',
                'status' => PunchList::STATUS_DRAFT,
                'created_by' => $manager->id,
            ]
        );
        $draftSnags = $snagPool
            ->filter(fn (Snag $snag) => $snag->status !== SnagStatus::Closed->value)
            ->skip(8)
            ->take(4);
        $draftList->snags()->syncWithoutDetaching(
            $draftSnags->mapWithKeys(fn (Snag $snag) => [$snag->id => ['added_by' => $manager->id]])->all()
        );
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
     * Replace mojibake (U+FFFD replacement char) and stray control characters
     * with normal dashes / spaces so seeded text is clean.
     */
    private function clean(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        // Normalise the Unicode replacement character to a dash.
        $value = str_replace("\u{FFFD}", '-', $value);
        // Any leftover invalid UTF-8 bytes become dashes too.
        $value = preg_replace('/[\x{FFFD}]/u', '-', $value) ?? $value;
        // Strip control characters except newline / carriage return / tab.
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '-', $value) ?? $value;
        // Collapse runs of dashes/spaces created by the substitutions.
        $value = preg_replace('/[ \t]+/', ' ', $value) ?? $value;

        return trim($value);
    }

    /**
     * The demo users keep the exact credentials the login screen pre-fills
     * (admin@sky.demo / manager@sky.demo, password "password") so login keeps
     * working, plus the real KAGA engineer (Osama Balluli) and an inspector.
     *
     * @return array<string, User>
     */
    private function seedUsers(Organization $organization): array
    {
        $seedUsers = [
            'org_admin' => ['name' => 'KAGA Admin', 'email' => 'admin@sky.demo'],
            'project_manager' => ['name' => 'KAGA Manager', 'email' => 'manager@sky.demo'],
            'engineer' => ['name' => 'Osama Balluli', 'email' => 'engineer@sky.demo'],
            'inspector' => ['name' => 'KAGA Inspector', 'email' => 'inspector@sky.demo'],
            'viewer' => ['name' => 'KAGA Viewer', 'email' => 'viewer@sky.demo'],
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
            $user->syncRoles($role);

            $users[$role] = $user;
        }

        return $users;
    }

    private function seedProject(Organization $organization, array $projectMeta): Project
    {
        $phase = $this->clean($projectMeta['phase'] ?? 'Pre-opening / Soft Launch');
        $block = $this->clean($projectMeta['block'] ?? 'BL05');
        $week = $this->clean($projectMeta['week'] ?? 'W355');
        $client = $this->clean($projectMeta['client'] ?? 'Riyadh Region Municipality');

        return Project::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'code' => 'KAGA',
            ],
            [
                'name' => 'Advanced Gardens (KAGA) — Riyadh',
                'description' => sprintf(
                    'Advanced Gardens (KAGA) for %s. Block %s, Week %s progress tracker. '.
                    '%s readiness across the Energy Centre, chiller plant, water & utilities '.
                    '(RO / STP / tanks), generators, electrical (MV/LV/MDP), gardens and administration buildings.',
                    $client,
                    $block,
                    $week,
                    $phase,
                ),
                'status' => 'active',
                'location' => 'Riyadh, KSA',
                'is_training' => false,
                'training_locked' => false,
                'training_notes' => null,
                'start_date' => Carbon::parse('2025-12-01'),
                'end_date' => Carbon::parse('2026-09-30'),
            ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function seedZoneDefinitions(): array
    {
        // ~7 sensible zones. Each zone maps a set of keyword matchers (against a
        // lower-cased snag `area` / asset `name`) to a Building + Floor + Location.
        return [
            'energy_centre' => [
                'building' => ['name' => 'Energy Centre', 'code' => 'KAGA-BL-EC'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Energy Centre Hall', 'code' => 'EC-L01', 'type' => 'service'],
                'keywords' => ['energy', 'ec1', 'ec2', 'heat exchanger', 'main crescent plant'],
            ],
            'chiller_plant' => [
                'building' => ['name' => 'Chiller Plant', 'code' => 'KAGA-BL-CH'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Chiller Hall', 'code' => 'CH-L01', 'type' => 'service'],
                'keywords' => ['chiller', 'air separator', 'chilled water', 'injection'],
            ],
            'water_utilities' => [
                'building' => ['name' => 'Water & Utilities', 'code' => 'KAGA-BL-WU'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Utilities Plant Room', 'code' => 'WU-L01', 'type' => 'service'],
                'keywords' => ['ro plant', 'reverse osmosis', 'stp', 'sewage', 'water tank', 'potable', 'non potable', 'fire fighting', 'fire water', 'water garden'],
            ],
            'generators' => [
                'building' => ['name' => 'Generators', 'code' => 'KAGA-BL-GEN'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Generator Hall', 'code' => 'GEN-L01', 'type' => 'service'],
                'keywords' => ['generator', 'fuel'],
            ],
            'electrical' => [
                'building' => ['name' => 'Electrical (MV/LV/MDP)', 'code' => 'KAGA-BL-ELE'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Switch Room', 'code' => 'ELE-L01', 'type' => 'service'],
                'keywords' => ['distribution panel', 'low voltage', 'medium voltage', 'switch room', 'mdp', 'main distribution', 'bms', 'security & fire', 'north administration'],
            ],
            'gardens' => [
                'building' => ['name' => 'Gardens', 'code' => 'KAGA-BL-GDN'],
                'floor' => ['name' => 'Site Level', 'code' => 'SL', 'level' => 0],
                'location' => ['name' => 'Central Garden', 'code' => 'GDN-L01', 'type' => 'room'],
                'keywords' => ['garden', 'planting', 'butterfly', 'central garden', 'crescent', 'pavilion'],
            ],
            'administration' => [
                'building' => ['name' => 'Administration', 'code' => 'KAGA-BL-ADM'],
                'floor' => ['name' => 'Ground Floor', 'code' => 'GF', 'level' => 0],
                'location' => ['name' => 'Administration Building', 'code' => 'ADM-L01', 'type' => 'room'],
                'keywords' => ['administration', 'mosque', 'watch tower', 'restaurant', 'cafeteria', 'toilet', 'child care', 'entrance', 'auditorium', 'ticket', 'management', 'civil defense', 'parking', 'plaza', 'aviary', 'maze', 'discovery', 'physic', 'general', 'site wide', 'site towers'],
            ],
        ];
    }

    /**
     * Build Building -> Floor -> Location for every KAGA zone, plus a dedicated
     * Location for every distinct snag `area` so each snag can link to one.
     *
     * @return array{
     *   buildings: Collection<int, Building>,
     *   floors: Collection<int, Floor>,
     *   locations: Collection<int, Location>,
     *   zone_location: array<string, Location>,
     *   area_location: array<string, Location>,
     *   fallback: Location
     * }
     */
    private function seedHierarchy(Organization $organization, Project $project, array $snagRows, array $assets): array
    {
        $definitions = $this->seedZoneDefinitions();

        $buildings = collect();
        $floors = collect();
        $locations = collect();
        $zoneLocation = [];
        $zoneFloor = [];
        $sort = 0;

        foreach ($definitions as $zoneKey => $definition) {
            $building = Building::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $project->id,
                    'code' => $definition['building']['code'],
                ],
                [
                    'name' => $definition['building']['name'],
                    'sort_order' => $sort,
                ]
            );
            $buildings->push($building);

            $floor = Floor::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'building_id' => $building->id,
                    'code' => $definition['floor']['code'],
                ],
                [
                    'name' => $definition['floor']['name'],
                    'level' => $definition['floor']['level'],
                    'sort_order' => 0,
                ]
            );
            $floors->push($floor);
            $zoneFloor[$zoneKey] = $floor;

            $location = Location::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'floor_id' => $floor->id,
                    'code' => $definition['location']['code'],
                ],
                [
                    'name' => $definition['location']['name'],
                    'type' => $definition['location']['type'],
                    'barcode' => sprintf('BC-%d-%s', $organization->id, $definition['location']['code']),
                ]
            );
            $locations->push($location);
            $zoneLocation[$zoneKey] = $location;

            $sort++;
        }

        $fallback = $zoneLocation['administration'];

        // Map every distinct snag `area` to a Location (created under its matched
        // zone floor) so snags always link to a specific, named location.
        $areaLocation = [];
        $locationSeq = [];

        $distinctAreas = collect($snagRows)
            ->map(fn (array $row) => $this->clean($row['area'] ?? ''))
            ->filter()
            ->unique()
            ->values();

        foreach ($distinctAreas as $area) {
            $zoneKey = $this->matchZone($area, $definitions);
            $floor = $zoneFloor[$zoneKey];

            $locationSeq[$zoneKey] = ($locationSeq[$zoneKey] ?? 0) + 1;
            $code = sprintf('%s-A%02d', strtoupper(substr($definitions[$zoneKey]['location']['code'], 0, 3)), $locationSeq[$zoneKey]);

            $location = Location::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'floor_id' => $floor->id,
                    'code' => $code,
                ],
                [
                    'name' => $this->truncate($area, 120),
                    'type' => 'service',
                    'barcode' => sprintf('BC-%d-%s', $organization->id, $code),
                ]
            );

            $locations->push($location);
            $areaLocation[$area] = $location;
        }

        return [
            'buildings' => $buildings,
            'floors' => $floors,
            'locations' => $locations,
            'zone_location' => $zoneLocation,
            'area_location' => $areaLocation,
            'fallback' => $fallback,
        ];
    }

    /**
     * @param  array<string, mixed>  $definitions
     */
    private function matchZone(string $text, array $definitions): string
    {
        $haystack = strtolower($text);

        foreach ($definitions as $zoneKey => $definition) {
            foreach ($definition['keywords'] as $keyword) {
                if (str_contains($haystack, $keyword)) {
                    return $zoneKey;
                }
            }
        }

        return 'administration';
    }

    /**
     * @param  array{buildings: Collection<int, Building>, floors: Collection<int, Floor>, locations: Collection<int, Location>}  $hierarchy
     * @param  array<string, User>  $users
     */
    private function seedDrawing(Organization $organization, Project $project, array $hierarchy, array $users, string $samplePng, string $samplePdf): Drawing
    {
        /** @var Building $building */
        $building = $hierarchy['buildings']->first();
        /** @var Floor $floor */
        $floor = $hierarchy['floors']->firstWhere('building_id', $building->id);

        $drawing = Drawing::query()->updateOrCreate(
            [
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'code' => 'KAGA-DRW-01',
            ],
            [
                'building_id' => $building->id,
                'floor_id' => $floor->id,
                'title' => 'KAGA Site MEP General Arrangement',
                'description' => 'Overall site MEP arrangement for the Advanced Gardens (KAGA) soft-launch scope.',
            ]
        );

        $rev1Path = sprintf('seed/org_%d/project_%d/drawing_%d-r1.png', $organization->id, $project->id, $drawing->id);
        $rev2Path = sprintf('seed/org_%d/project_%d/drawing_%d-r2.pdf', $organization->id, $project->id, $drawing->id);

        // Prefer the committed placeholder floor-plan (a real PNG/PDF) so the canvas
        // renders an actual plan surface; fall back to the generic sample bytes.
        $planPngPath = database_path('seeders/data/kaga_drawing_placeholder.png');
        $planPdfPath = database_path('seeders/data/kaga_drawing_placeholder.pdf');
        $planPng = is_file($planPngPath) ? (string) file_get_contents($planPngPath) : $samplePng;
        $planPdf = is_file($planPdfPath) ? (string) file_get_contents($planPdfPath) : $samplePdf;
        Storage::disk('public')->put($rev1Path, $planPng);
        Storage::disk('public')->put($rev2Path, $planPdf);

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
                'file_size' => strlen($planPng),
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
                'mime_type' => 'application/pdf',
                'file_size' => strlen($planPdf),
                'uploaded_by' => $users['project_manager']->id,
                'notes' => 'Latest coordinated issue set',
                'is_current' => true,
            ]
        );

        // The image revision (R1) is the default surface so the canvas shows a plan,
        // not a PDF iframe. R2 (PDF) stays available in the revision selector.
        $revision1->update(['is_current' => true]);
        $revision2->update(['is_current' => false]);
        $drawing->update(['current_revision_id' => $revision1->id]);

        return $drawing->fresh(['revisions', 'currentRevision']);
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedProjectRoles(Organization $organization, Project $project, array $users): void
    {
        ProjectUserRole::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->delete();

        $assignments = [
            $users['project_manager']->id => 'project_manager',
            $users['engineer']->id => 'engineer',
            $users['inspector']->id => 'inspector',
            $users['viewer']->id => 'viewer',
        ];

        foreach ($assignments as $userId => $roleName) {
            ProjectUserRole::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $userId,
                'role_name' => $roleName,
                'source' => 'seed',
            ]);
        }
    }

    /**
     * Snags from the 52 real KAGA site observations.
     *
     * @param  array{zone_location: array<string, Location>, area_location: array<string, Location>, fallback: Location}  $hierarchy
     * @param  array<string, User>  $users
     * @return Collection<int, Snag>
     */
    private function seedSnags(
        Organization $organization,
        Project $project,
        Drawing $drawing,
        array $hierarchy,
        array $users,
        array $snagRows,
        string $samplePng
    ): Collection {
        $engineer = $users['engineer'];
        $seeded = collect();

        // Sequential counters used to spread otherwise-uniform statuses across
        // every lifecycle column so the board is fully populated.
        $inProgressCount = 0;
        $openCount = 0;

        foreach ($snagRows as $index => $row) {
            $area = $this->clean($row['area'] ?? 'General');
            $observation = $this->clean($row['observation'] ?? '');
            $risk = $this->clean($row['risk'] ?? '');
            $issue = $this->clean($row['issue'] ?? '');
            $rawStatus = trim((string) ($row['status'] ?? 'Open'));

            /** @var Location $location */
            $location = $hierarchy['area_location'][$area] ?? $hierarchy['fallback'];
            /** @var Floor $floor */
            $floor = Floor::query()->findOrFail($location->floor_id);

            $status = $this->mapSnagStatus($rawStatus, $inProgressCount, $openCount);
            $priority = $this->mapSnagPriority($risk, $issue);

            $createdAt = Carbon::parse($row['date'] ?? '2025-12-22')->setTime(
                fake()->numberBetween(8, 15),
                fake()->numberBetween(0, 59)
            );

            $firstLine = $this->firstObservationLine($observation);
            $title = $this->truncate($area.' — '.$firstLine, 70);

            $description = trim($observation);
            if ($risk !== '') {
                $description .= "\n\nRisk: ".$risk;
            }
            if ($issue !== '') {
                $description .= "\n\nIssue: ".$issue;
            }
            if ($description === '') {
                $description = $area.' site observation.';
            }

            $isClosed = $status === SnagStatus::Closed->value;
            $isRejected = $status === SnagStatus::Rejected->value;

            // Flag roughly one in three snags as DLP (Defects Liability Period)
            // items — spread across every lifecycle lane — with a Cluster and a
            // Taking-Over Certificate reference so the DLP board filter has data.
            $dlpSeq = $this->snagRefCounter;
            $isDlp = $dlpSeq % 3 === 0;
            $dlpClusters = ['North Cluster', 'South Cluster', 'East Cluster', 'Central Cluster'];

            $snag = Snag::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'drawing_id' => $drawing->id,
                'drawing_revision_id' => $drawing->current_revision_id,
                'building_id' => $floor->building_id,
                'floor_id' => $floor->id,
                'location_id' => $location->id,
                'reference' => sprintf('SNG-%05d', $this->snagRefCounter++),
                'title' => $title,
                'description' => $description,
                'priority' => $priority,
                'trade' => $this->tradeForArea($area),
                'status' => $status,
                'is_dlp' => $isDlp,
                'cluster' => $isDlp ? $dlpClusters[$dlpSeq % 4] : null,
                'toc_reference' => $isDlp ? sprintf('TOC-KG%03d', $dlpSeq) : null,
                'pin_x' => fake()->randomFloat(6, 0.08, 0.92),
                'pin_y' => fake()->randomFloat(6, 0.08, 0.92),
                'created_by' => $engineer->id,
                'assigned_to' => $status === SnagStatus::New->value ? null : $engineer->id,
                'due_date' => Carbon::parse($row['date'] ?? '2025-12-22')->addDays(fake()->numberBetween(7, 45)),
                'estimated_hours' => fake()->optional(0.5)->randomFloat(2, 2, 48),
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

            if ($isClosed) {
                $snag->closed_at = $createdAt->copy()->addDays(fake()->numberBetween(1, 12));
            }

            $snag->save();

            $this->seedStatusHistory($snag, $organization, $engineer, $createdAt);

            $seeded->push($snag);
        }

        return $seeded;
    }

    /**
     * Map the KAGA visit status to a SnagStatus value, deliberately spreading
     * "In Progress" and "Open" rows so every lifecycle column is populated:
     *  - "Resolved"    -> closed
     *  - "In Progress" -> in_progress (every 4th -> ready_for_review)
     *  - "Open"        -> assigned    (every 3rd -> new)
     */
    private function mapSnagStatus(string $rawStatus, int &$inProgressCount, int &$openCount): string
    {
        $normalized = strtolower($rawStatus);

        if (str_contains($normalized, 'resolved')) {
            return SnagStatus::Closed->value;
        }

        if (str_contains($normalized, 'progress')) {
            $inProgressCount++;

            return $inProgressCount % 4 === 0
                ? SnagStatus::ReadyForReview->value
                : SnagStatus::InProgress->value;
        }

        // Default / "Open".
        $openCount++;

        return $openCount % 3 === 0
            ? SnagStatus::New->value
            : SnagStatus::Assigned->value;
    }

    /**
     * Priority from the risk (and issue) text:
     *  - contains "Safety"                 -> critical
     *  - contains "completion"/"handover"  -> high
     *  - any other risk/issue text         -> medium
     *  - otherwise                         -> low
     */
    private function mapSnagPriority(string $risk, string $issue): string
    {
        $riskLower = strtolower($risk);

        if (str_contains($riskLower, 'safety')) {
            return 'critical';
        }

        if (str_contains($riskLower, 'completion') || str_contains($riskLower, 'handover')) {
            return 'high';
        }

        if ($risk !== '' || $issue !== '') {
            return 'medium';
        }

        return 'low';
    }

    private function tradeForArea(string $area): string
    {
        $haystack = strtolower($area);

        return match (true) {
            str_contains($haystack, 'chiller'), str_contains($haystack, 'generator'),
            str_contains($haystack, 'fuel'), str_contains($haystack, 'heat exchanger'),
            str_contains($haystack, 'water'), str_contains($haystack, 'ro plant'),
            str_contains($haystack, 'stp'), str_contains($haystack, 'air separator') => 'Mechanical',
            str_contains($haystack, 'voltage'), str_contains($haystack, 'panel'),
            str_contains($haystack, 'distribution'), str_contains($haystack, 'switch'),
            str_contains($haystack, 'bms'), str_contains($haystack, 'generator system') => 'Electrical',
            str_contains($haystack, 'garden'), str_contains($haystack, 'central garden') => 'Landscaping',
            default => 'MEP',
        };
    }

    private function firstObservationLine(string $observation): string
    {
        if ($observation === '') {
            return 'Site observation recorded';
        }

        $line = preg_split('/\r?\n/', $observation)[0] ?? $observation;
        // Drop a leading "1. " enumerator for a cleaner title.
        $line = preg_replace('/^\s*\d+\.\s*/', '', $line) ?? $line;

        return trim($line) !== '' ? trim($line) : 'Site observation recorded';
    }

    private function truncate(string $value, int $length): string
    {
        $value = trim($value);

        if (mb_strlen($value) <= $length) {
            return $value;
        }

        return rtrim(mb_substr($value, 0, $length - 1)).'…';
    }

    private function seedStatusHistory(Snag $snag, Organization $organization, User $author, Carbon $createdAt): void
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

        foreach ($path as $stepIndex => $toStatus) {
            $fromStatus = $stepIndex === 0 ? null : $path[$stepIndex - 1];

            SnagStatusHistory::query()->create([
                'snag_id' => $snag->id,
                'organization_id' => $organization->id,
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'changed_by' => $author->id,
                'note' => $stepIndex === 0 ? 'Snag created from KAGA site visit.' : null,
                'metadata' => null,
                'created_at' => $createdAt->copy()->addHours($stepIndex * 6),
            ]);
        }
    }

    /**
     * Equipment from the 51 real KAGA assets. Every asset carries status
     * "Not Finalized" (pre-opening, not yet commissioned) which maps to the
     * VALID Equipment status 'warn' — the frontend renders 'warn' as the
     * "Maintenance"/pending state (see web/src/pages/EquipmentPage.jsx). The
     * status column has no DB enum, and the app only recognises
     * ok/warn/critical/inactive, so 'warn' is the correct pending value.
     *
     * @param  array{zone_location: array<string, Location>, fallback: Location}  $hierarchy
     * @param  array<string, User>  $users
     * @param  Collection<int, Snag>  $snags
     */
    private function seedEquipment(
        Organization $organization,
        Project $project,
        array $hierarchy,
        array $users,
        Collection $snags,
        array $assets
    ): void {
        $definitions = $this->seedZoneDefinitions();

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

        $index = 0;

        foreach ($assets as $asset) {
            $index++;
            $name = $this->clean($asset['name'] ?? ('Asset '.$index));
            $classification = $this->clean($asset['classification'] ?? '');
            $activity = $this->clean($asset['activity'] ?? '');
            $owner = $this->clean($asset['owner'] ?? '');
            $notes = $this->clean($asset['notes'] ?? '');

            $zoneKey = $this->matchZone($name, $definitions);
            /** @var Location $location */
            $location = $hierarchy['zone_location'][$zoneKey] ?? $hierarchy['fallback'];

            $lastMaintenanceAt = Carbon::now()->subDays(fake()->numberBetween(5, 60));

            $noteParts = array_filter([
                $classification !== '' ? 'Classification: '.$classification : null,
                $owner !== '' ? 'Owner: '.$owner : null,
                $notes !== '' ? 'Notes: '.$notes : null,
            ]);

            $equipment = Equipment::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'location_id' => $location->id,
                'code' => sprintf('KAGA-EQ-%03d', $index),
                'name' => $this->truncate($name, 180),
                // Category derived from the real classification/activity fields.
                'category' => $this->equipmentCategory($classification, $activity, $name),
                'barcode' => sprintf('EQ-%d-%d-%03d', $organization->id, $project->id, $index),
                'serial_number' => sprintf('KAGA-SN-%04d', $index),
                'manufacturer' => null,
                'model' => null,
                // "Not Finalized" -> 'warn' (UI label "Maintenance" / pending).
                'status' => 'warn',
                'installed_at' => Carbon::now()->subMonths(fake()->numberBetween(2, 14))->toDateString(),
                'last_maintenance_at' => $lastMaintenanceAt,
                'next_service_at' => $lastMaintenanceAt->copy()->addDays(fake()->numberBetween(30, 90))->toDateString(),
                'notes' => $noteParts !== [] ? implode(' | ', $noteParts) : 'Not Finalized — pending commissioning / T&C.',
                'created_by' => $users['project_manager']->id,
            ]);

            // Add a couple of maintenance logs to the first ~12 assets.
            if ($index <= 12) {
                $logCount = fake()->numberBetween(1, 3);
                for ($logIndex = 0; $logIndex < $logCount; $logIndex++) {
                    $performer = collect([$users['project_manager'], $users['engineer'], $users['inspector']])->random();
                    $occurredAt = Carbon::now()->subDays(fake()->numberBetween(1, 55))->subHours(fake()->numberBetween(0, 20));
                    $linkedSnag = $snags->isNotEmpty() && fake()->boolean(40) ? $snags->random() : null;

                    EquipmentMaintenanceLog::query()->create([
                        'organization_id' => $organization->id,
                        'equipment_id' => $equipment->id,
                        'project_id' => $project->id,
                        'snag_id' => $linkedSnag?->id,
                        'performed_by' => $performer->id,
                        'status' => fake()->randomElement(['ok', 'warn', 'warn', 'critical']),
                        'description' => fake()->randomElement([
                            'Pre-commissioning inspection recorded.',
                            'T&C readiness check performed.',
                            'Functional test — pending final sign-off.',
                            'Snag rectification verified on site.',
                        ]),
                        'action_taken' => fake()->optional()->sentence(),
                        'occurred_at' => $occurredAt,
                        'next_due_at' => $occurredAt->copy()->addDays(fake()->numberBetween(14, 45)),
                        'metadata' => ['seeded' => true, 'source' => 'kaga'],
                    ]);

                    if ($linkedSnag && ! $linkedSnag->equipment_id && fake()->boolean(60)) {
                        $linkedSnag->equipment_id = $equipment->id;
                        $linkedSnag->save();
                    }
                }
            }
        }
    }

    private function equipmentCategory(string $classification, string $activity, string $name): string
    {
        $haystack = strtolower($name);

        return match (true) {
            str_contains($haystack, 'chiller'), str_contains($haystack, 'energy'),
            str_contains($haystack, 'generator'), str_contains($haystack, 'water'),
            str_contains($haystack, 'osmosis'), str_contains($haystack, 'sewage'),
            str_contains($haystack, 'plant') => 'MEP',
            str_contains($haystack, 'garden'), str_contains($haystack, 'planting') => 'Landscaping',
            str_contains($haystack, 'security'), str_contains($haystack, 'fire'),
            str_contains($haystack, 'defense'), str_contains($haystack, 'watch tower') => 'Safety',
            default => 'Building',
        };
    }

    /**
     * One or two inspection templates plus several submissions across statuses,
     * reusing the same status-aware form_data approach as DemoDataSeeder so the
     * computed completion_percent reads sensibly (approved ~100%, rejected low).
     *
     * @param  array<string, User>  $users
     */
    private function seedInspections(Organization $organization, Project $project, array $users, string $samplePng): void
    {
        $templateCatalog = [
            ['type' => 'commissioning', 'name' => 'MEP Commissioning Verification', 'discipline' => 'MEP'],
            ['type' => 'handover', 'name' => 'T&C Handover Readiness', 'discipline' => 'MEP'],
        ];

        $templates = collect();

        foreach ($templateCatalog as $i => $catalog) {
            $templateCode = sprintf('INSP-TPL-%03d', $this->inspectionTemplateCounter++);
            $hasOwnerSignOff = $i === 0;

            $workflow = [
                ['step_order' => 1, 'step_name' => 'Consultant Review', 'role_name' => 'inspector', 'requires_signature' => false],
                ['step_order' => 2, 'step_name' => 'Project Manager Approval', 'role_name' => 'project_manager', 'requires_signature' => false],
            ];

            if ($hasOwnerSignOff) {
                $workflow[] = ['step_order' => 3, 'step_name' => 'Owner Sign-Off', 'role_name' => 'org_admin', 'requires_signature' => true];
            }

            $template = InspectionTemplate::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'name' => $catalog['name'].' - KAGA',
                'code' => $templateCode,
                'type' => $catalog['type'],
                'discipline' => $catalog['discipline'],
                'description' => $catalog['name'].' checklist for the Advanced Gardens (KAGA) soft-launch scope.',
                'schema' => [
                    'sections' => [
                        [
                            'title' => 'General Information',
                            'fields' => [
                                ['key' => 'area', 'label' => 'Area / System', 'type' => 'text', 'required' => true],
                                ['key' => 'inspection_date', 'label' => 'Inspection Date', 'type' => 'date', 'required' => true],
                                ['key' => 'inspector_notes', 'label' => 'Inspector Notes', 'type' => 'textarea', 'required' => true],
                            ],
                        ],
                        [
                            'title' => 'Checklist',
                            'fields' => [
                                ['key' => 'severity', 'label' => 'Severity', 'type' => 'select', 'required' => true, 'options' => ['low', 'medium', 'high', 'critical']],
                                ['key' => 'items_count', 'label' => 'Items Checked', 'type' => 'number', 'required' => false],
                                ['key' => 'power_energised', 'label' => 'Power supplied and circuits energised', 'type' => 'checkbox', 'required' => true],
                                ['key' => 'insulation_verified', 'label' => 'Insulation / megger test verified', 'type' => 'checkbox', 'required' => true],
                                ['key' => 'flow_switch_ok', 'label' => 'Flow switch operational', 'type' => 'checkbox', 'required' => true],
                                ['key' => 'labelling_complete', 'label' => 'Panel / cable labelling complete', 'type' => 'checkbox', 'required' => true],
                                ['key' => 'safety_measures', 'label' => 'Safety measures in place', 'type' => 'checkbox', 'required' => true],
                                ['key' => 'safe_to_proceed', 'label' => 'Safe to proceed', 'type' => 'checkbox', 'required' => false],
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

        // Spread submissions deterministically across every status so each
        // column is populated.
        $submissionStatuses = [
            InspectionSubmission::STATUS_APPROVED,
            InspectionSubmission::STATUS_IN_REVIEW,
            InspectionSubmission::STATUS_SUBMITTED,
            InspectionSubmission::STATUS_REJECTED,
            InspectionSubmission::STATUS_DRAFT,
            InspectionSubmission::STATUS_APPROVED,
            InspectionSubmission::STATUS_IN_REVIEW,
            InspectionSubmission::STATUS_SUBMITTED,
        ];

        foreach ($submissionStatuses as $i => $status) {
            /** @var InspectionTemplate $template */
            $template = $templates[$i % $templates->count()];
            $creator = collect([$users['project_manager'], $users['engineer']])->random();

            $createdAt = Carbon::now()->subDays(fake()->numberBetween(1, 45))->subHours(fake()->numberBetween(0, 20));
            $submittedAt = $status === InspectionSubmission::STATUS_DRAFT
                ? null
                : $createdAt->copy()->addHours(fake()->numberBetween(1, 24));

            $submission = InspectionSubmission::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'inspection_template_id' => $template->id,
                'reference' => sprintf('INSP-%05d', $this->inspectionSubmissionCounter++),
                'status' => $status,
                'form_data' => $this->buildInspectionFormData($template, $status),
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

            if ($status === InspectionSubmission::STATUS_DRAFT) {
                continue;
            }

            $workflow = collect($template->approval_workflow ?? [])->sortBy('step_order')->values();
            $approvals = collect();

            foreach ($workflow as $step) {
                $approvals->push(InspectionApproval::query()->create([
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
                ]));
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

                    $submission->current_approval_order = optional($ordered->get(1))->step_order;
                } else {
                    $submission->current_approval_order = optional($ordered->first())->step_order;
                }
            }

            if ($status === InspectionSubmission::STATUS_APPROVED) {
                foreach ($approvals->sortBy('step_order')->values() as $stepIndex => $approval) {
                    $actor = $this->inspectionUserForRole($approval->role_name, $users);
                    $approval->status = InspectionApproval::STATUS_APPROVED;
                    $approval->approver_id = $actor->id;
                    $approval->decision_notes = 'Approved during seeded workflow.';
                    $approval->acted_at = $submittedAt?->copy()->addHours(4 + ($stepIndex * 4));
                    $approval->save();
                }

                $submission->approved_at = $submittedAt?->copy()->addDays(fake()->numberBetween(1, 5)) ?? now()->subDay();
                $submission->current_approval_order = null;
            }

            if ($status === InspectionSubmission::STATUS_REJECTED) {
                $ordered = $approvals->sortBy('step_order')->values();
                $rejectAt = min(2, $ordered->count()) - 1;

                foreach ($ordered as $stepIndex => $approval) {
                    $actor = $this->inspectionUserForRole($approval->role_name, $users);

                    if ($stepIndex < $rejectAt) {
                        $approval->status = InspectionApproval::STATUS_APPROVED;
                        $approval->approver_id = $actor->id;
                        $approval->decision_notes = 'Approved before rejection step.';
                        $approval->acted_at = $submittedAt?->copy()->addHours(4 + ($stepIndex * 4));
                        $approval->save();

                        continue;
                    }

                    if ($stepIndex === $rejectAt) {
                        $approval->status = InspectionApproval::STATUS_REJECTED;
                        $approval->approver_id = $actor->id;
                        $approval->decision_notes = 'Rejected for corrective action.';
                        $approval->acted_at = $submittedAt?->copy()->addHours(8 + ($stepIndex * 4));
                        $approval->save();
                    }
                }

                $submission->rejected_at = $submittedAt?->copy()->addDays(fake()->numberBetween(1, 4)) ?? now()->subDay();
                $submission->current_approval_order = null;
            }

            $submission->save();
        }
    }

    /**
     * InspectionRequests built from the 10 planned KAGA follow-up visits.
     *
     * @param  array<string, User>  $users
     */
    private function seedInspectionRequests(Organization $organization, Project $project, array $users, array $planRows): void
    {
        foreach ($planRows as $plan) {
            $area = $this->clean($plan['areas'] ?? 'General');
            $purpose = $this->clean($plan['purpose'] ?? 'Follow up open observations and T&C readiness');
            $notes = $this->clean($plan['notes'] ?? '');
            $scheduledFor = Carbon::parse($plan['date'] ?? '2026-05-13')->setTime(9, 0);

            $description = $purpose;
            if ($notes !== '') {
                $description .= "\n\nNotes: ".$notes;
            }

            InspectionRequest::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project->id,
                'inspection_submission_id' => null,
                'reference' => sprintf('REQ-%05d', $this->inspectionRequestCounter++),
                'request_type' => InspectionRequest::TYPE_WIR,
                'title' => $this->truncate($area.' — '.$purpose, 120),
                'description' => $description,
                'status' => InspectionRequest::STATUS_SCHEDULED,
                'requested_by' => $users['engineer']->id,
                'assigned_to' => $users['inspector']->id,
                'scheduled_for' => $scheduledFor,
                'completed_at' => null,
                'metadata' => ['seeded' => true, 'source' => 'kaga', 'plan_id' => $this->clean($plan['plan_id'] ?? '')],
                'created_at' => $scheduledFor->copy()->subDays(fake()->numberBetween(1, 5)),
                'updated_at' => $scheduledFor->copy()->subDays(fake()->numberBetween(0, 1)),
            ]);
        }
    }

    private function buildInspectionFormData(InspectionTemplate $template, string $status): array
    {
        $data = [];
        $sections = collect($template->schema['sections'] ?? []);

        // Pass probability for gradeable (checkbox) checklist items, by lifecycle
        // status, so the computed completion_percent reads sensibly: approved forms
        // are fully passed, rejected forms carry real failures, drafts are partway.
        $passChance = match ($status) {
            InspectionSubmission::STATUS_APPROVED => 100,
            InspectionSubmission::STATUS_SUBMITTED, InspectionSubmission::STATUS_IN_REVIEW => 88,
            InspectionSubmission::STATUS_REJECTED => 55,
            default => 70,
        };

        $checkboxKeys = [];

        foreach ($sections as $sectionIndex => $section) {
            $fields = collect($section['fields'] ?? []);

            foreach ($fields as $fieldIndex => $field) {
                $key = (string) ($field['key'] ?? 'field_'.$sectionIndex.'_'.$fieldIndex);

                if (strtolower((string) ($field['type'] ?? 'text')) === 'checkbox') {
                    $data[$key] = fake()->boolean($passChance);
                    $checkboxKeys[] = $key;
                } else {
                    $data[$key] = $this->fakeInspectionFieldValue($field);
                }
            }
        }

        // A rejected inspection must show at least two failed checklist items.
        if ($status === InspectionSubmission::STATUS_REJECTED && count($checkboxKeys) >= 2) {
            foreach ((array) fake()->randomElements($checkboxKeys, 2) as $failKey) {
                $data[$failKey] = false;
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
}
