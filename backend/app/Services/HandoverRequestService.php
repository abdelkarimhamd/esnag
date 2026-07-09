<?php

namespace App\Services;

use App\Models\HandoverRequest;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\Snag;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Support\HandoverActions;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Creates handover requests (minting the permanent reference and FREEZING the
 * resolved workflow into a write-once snapshot) and links snags/inspections.
 */
class HandoverRequestService
{
    public function __construct(
        private readonly HandoverWorkflowService $workflowService,
        private readonly HandoverRoutingService $routingService,
    ) {
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(User $actor, int $organizationId, int $projectId, array $data): HandoverRequest
    {
        $workflow = $this->workflowService->resolveForProject($organizationId, $projectId);
        $snapshot = $this->workflowService->buildSnapshot($workflow);
        $this->workflowService->validateStages($snapshot);

        $firstStageOrder = (int) ($snapshot[0]['stage_order'] ?? 1);

        return DB::transaction(function () use ($actor, $organizationId, $projectId, $data, $workflow, $snapshot, $firstStageOrder): HandoverRequest {
            $request = new HandoverRequest([
                ...Arr::only($data, ['title', 'description', 'area_id', 'building_id', 'floor_id', 'location_id', 'location_text']),
                'organization_id' => $organizationId,
                'project_id' => $projectId,
                'reference' => $this->mintReference($organizationId),
                'workflow_id' => $workflow->id,
                'workflow_version' => $workflow->version,
                'stage_graph_snapshot' => $snapshot,
                'current_stage_order' => $firstStageOrder,
                'status' => HandoverRequest::STATUS_DRAFT,
                'cycle_number' => 1,
            ]);
            $request->save();

            // Resolve + denormalize the first stage's concrete party.
            $firstNode = $request->stageNode($firstStageOrder);
            if ($firstNode) {
                $this->routingService->resolveStageParty($request, $firstNode);
                $request->save();
            }

            $this->routingService->recordEvent(
                $request,
                $actor,
                HandoverActions::CREATE,
                null,
                $firstStageOrder,
                null,
                HandoverRequest::STATUS_DRAFT,
                null,
            );

            return $request->fresh(['responsibleCompany:id,name,code,type', 'project:id,name,code', 'events']);
        });
    }

    /**
     * @param  array<int, int>  $snagIds
     */
    public function attachSnags(User $actor, HandoverRequest $request, array $snagIds, bool $mandatory = true): HandoverRequest
    {
        $snags = Snag::query()
            ->where('organization_id', $request->organization_id)
            ->where('project_id', $request->project_id)
            ->whereIn('id', $snagIds)
            ->get();

        if ($snags->count() !== count(array_unique($snagIds))) {
            throw ValidationException::withMessages(['snag_ids' => ['One or more snags do not belong to this project.']]);
        }

        // A re-attach must never DOWNGRADE an already-mandatory link, or an actor
        // could silently drop a snag out of the closure gate (BR-BR-011/012).
        $alreadyMandatory = $request->snags()
            ->wherePivot('is_mandatory', true)
            ->pluck('snags.id')
            ->all();

        $request->snags()->syncWithoutDetaching(
            $snags->mapWithKeys(fn (Snag $snag) => [
                $snag->id => [
                    'organization_id' => $request->organization_id,
                    'is_mandatory' => $mandatory || in_array($snag->id, $alreadyMandatory, true),
                    'attached_by' => $actor->id,
                ],
            ])->all()
        );

        $this->routingService->recordEvent(
            $request,
            $actor,
            'link_snags',
            $request->current_stage_order,
            $request->current_stage_order,
            $request->status,
            $request->status,
            null,
            ['snag_ids' => $snags->pluck('id')->all(), 'is_mandatory' => $mandatory],
        );

        return $request->fresh(['snags:id,reference,title,status,source_organization_id']);
    }

    /**
     * @param  array<int, int>  $submissionIds
     */
    public function attachInspections(User $actor, HandoverRequest $request, array $submissionIds): HandoverRequest
    {
        $submissions = InspectionSubmission::query()
            ->where('organization_id', $request->organization_id)
            ->whereIn('id', $submissionIds)
            ->get();

        if ($submissions->count() !== count(array_unique($submissionIds))) {
            throw ValidationException::withMessages(['inspection_submission_ids' => ['One or more inspection submissions do not belong to this organization.']]);
        }

        $request->inspectionSubmissions()->syncWithoutDetaching(
            $submissions->mapWithKeys(fn (InspectionSubmission $submission) => [
                $submission->id => [
                    'organization_id' => $request->organization_id,
                    'attached_by' => $actor->id,
                ],
            ])->all()
        );

        // Stamp the parent handover on each submission so operational snags raised
        // on it auto-link to this handover (BR-FR-023).
        InspectionSubmission::query()
            ->whereIn('id', $submissions->pluck('id'))
            ->update(['handover_request_id' => $request->id]);

        $this->routingService->recordEvent(
            $request,
            $actor,
            'link_inspections',
            $request->current_stage_order,
            $request->current_stage_order,
            $request->status,
            $request->status,
            null,
            ['inspection_submission_ids' => $submissions->pluck('id')->all()],
        );

        return $request->fresh(['inspectionSubmissions:id,reference,status']);
    }

    /**
     * The FMMP requests an operational inspection from a Service-Provider team,
     * bound to this handover (BR-FR-018). Piggy-backs on the stage 'assign' gate.
     *
     * @param  array<string, mixed>  $data
     */
    public function requestInspection(User $actor, HandoverRequest $request, array $data): InspectionRequest
    {
        $this->routingService->assertCanAct($request, $actor, HandoverActions::ASSIGN);

        $team = StakeholderTeam::query()->findOrFail((int) $data['stakeholder_team_id']);
        if ($team->organization_id !== $request->organization_id) {
            throw ValidationException::withMessages(['stakeholder_team_id' => ['The team does not belong to this organization.']]);
        }

        return DB::transaction(function () use ($actor, $request, $data, $team): InspectionRequest {
            $inspectionRequest = InspectionRequest::query()->create([
                'organization_id' => $request->organization_id,
                'project_id' => $request->project_id,
                'handover_request_id' => $request->id,
                'stakeholder_team_id' => $team->id,
                'reference' => $this->mintInspectionReference($request->organization_id),
                'request_type' => $data['request_type'] ?? 'operational_inspection',
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'status' => InspectionRequest::STATUS_REQUESTED,
                'requested_by' => $actor->id,
                'scheduled_for' => $data['scheduled_for'] ?? null,
            ]);

            $this->routingService->recordEvent(
                $request,
                $actor,
                'request_inspection',
                $request->current_stage_order,
                $request->current_stage_order,
                $request->status,
                $request->status,
                null,
                ['inspection_request_id' => $inspectionRequest->id, 'stakeholder_team_id' => $team->id],
            );

            return $inspectionRequest->fresh(['team:id,name,company_id', 'requester:id,name,email']);
        });
    }

    private function mintInspectionReference(int $organizationId): string
    {
        $sequence = InspectionRequest::query()->where('organization_id', $organizationId)->count() + 1;

        do {
            $reference = 'RTI-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
            $sequence++;
        } while (
            InspectionRequest::query()
                ->where('organization_id', $organizationId)
                ->where('reference', $reference)
                ->exists()
        );

        return $reference;
    }

    private function mintReference(int $organizationId): string
    {
        $sequence = HandoverRequest::query()->where('organization_id', $organizationId)->count() + 1;

        do {
            $reference = 'HR-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
            $sequence++;
        } while (
            HandoverRequest::query()
                ->where('organization_id', $organizationId)
                ->where('reference', $reference)
                ->exists()
        );

        return $reference;
    }
}
