<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Models\HandoverEvent;
use App\Models\HandoverRequest;
use App\Models\StakeholderCompany;
use App\Models\User;
use App\Notifications\HandoverStageNotification;
use App\Support\HandoverActions;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * The cross-party routing engine (BR-FR-005/006/007/008, BR-BR-001). Reads ONLY
 * the request's frozen stage_graph_snapshot, so admin config edits never reroute
 * in-flight requests. Every state change appends exactly one immutable event.
 */
class HandoverRoutingService
{
    /** Snag statuses that count as resolved for the closure gate. */
    private const TERMINAL_SNAG_STATUSES = [SnagStatus::Closed->value, SnagStatus::Rejected->value];

    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly PushNotificationService $pushNotificationService,
    ) {
    }

    /**
     * Move a draft into the live workflow and route it to the first reviewer
     * (BR-FR-001; §6.1 stage 1 "submit to DAR").
     */
    public function submit(HandoverRequest $request, User $actor): HandoverRequest
    {
        if ($request->status !== HandoverRequest::STATUS_DRAFT) {
            throw ValidationException::withMessages(['status' => ['Only a draft handover request can be submitted.']]);
        }

        $node = $request->currentStageNode();
        if (! $node) {
            throw ValidationException::withMessages(['status' => ['The request has no current stage.']]);
        }

        return DB::transaction(function () use ($request, $actor, $node): HandoverRequest {
            $this->assertActorCanAct($request, $node, $actor, HandoverActions::SUBMIT);
            $this->assertGateReady($request, $node);

            $priorStage = (int) $request->current_stage_order;
            $priorStatus = $request->status;

            $request->submitted_by = $actor->id;
            $request->submitted_by_company_id = $request->responsible_company_id;
            $request->submitted_at = now();

            $destination = $node['forward_to_stage'] ?? ($priorStage + 1);
            $this->moveTo($request, (int) $destination, HandoverActions::FORWARD);

            $this->recordEvent($request, $actor, HandoverActions::SUBMIT, $priorStage, $request->current_stage_order, $priorStatus, $request->status, null);
            $this->notifyCompanyMembers($request, $request->responsible_company_id, 'submitted', $actor, null);

            return $request->fresh($this->eagerLoads());
        });
    }

    /**
     * Perform a stage action: comment / forward / approve / return / reject /
     * revise / consolidate. Close and assign have dedicated methods.
     */
    public function act(HandoverRequest $request, User $actor, string $action, array $payload = []): HandoverRequest
    {
        if (in_array($action, [HandoverActions::CREATE, HandoverActions::SUBMIT, HandoverActions::CLOSE, HandoverActions::ASSIGN], true)) {
            throw ValidationException::withMessages(['action' => ["'{$action}' is not routed through act()."]]);
        }
        if (! in_array($request->status, HandoverRequest::TRANSACTIONAL_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => ['This handover request is not open for actions.']]);
        }

        $node = $request->currentStageNode();
        if (! $node) {
            throw ValidationException::withMessages(['status' => ['The request has no current stage.']]);
        }

        return DB::transaction(function () use ($request, $actor, $action, $payload, $node): HandoverRequest {
            $this->assertActorCanAct($request, $node, $actor, $action);

            $reasonRequired = $node['reason_required_actions'] ?? HandoverActions::REASON_REQUIRED;
            $reason = isset($payload['reason']) ? trim((string) $payload['reason']) : '';
            if (in_array($action, $reasonRequired, true) && $reason === '') {
                throw ValidationException::withMessages(['reason' => ["A reason is required to {$action} this request."]]);
            }

            $priorStage = (int) $request->current_stage_order;
            $priorStatus = $request->status;

            $destination = $this->resolveDestination($request, $node, $action);

            if ($destination !== null && $destination !== $priorStage) {
                if ($action === HandoverActions::FORWARD && ($node['is_loop_back'] ?? false)) {
                    $request->cycle_number = (int) $request->cycle_number + 1;
                }
                $this->moveTo($request, $destination, $action);
            } else {
                // In-stage action (comment / consolidate): status only, pointer stays.
                $request->status = match ($action) {
                    HandoverActions::CONSOLIDATE => HandoverRequest::STATUS_CONSOLIDATING,
                    HandoverActions::APPROVE => HandoverRequest::STATUS_APPROVED,
                    default => $request->status,
                };
                $request->save();
            }

            $this->recordEvent(
                $request,
                $actor,
                $action,
                $priorStage,
                $request->current_stage_order,
                $priorStatus,
                $request->status,
                $reason !== '' ? $reason : null,
            );

            if ($request->current_stage_order !== null && $request->current_stage_order !== $priorStage) {
                $this->notifyCompanyMembers($request, $request->responsible_company_id, $this->actionEvent($action), $actor, $reason !== '' ? $reason : null);
            }

            return $request->fresh($this->eagerLoads());
        });
    }

    /**
     * Assign a named user within the current-stage party (handover.assign).
     */
    public function assign(HandoverRequest $request, User $actor, User $assignee): HandoverRequest
    {
        $node = $request->currentStageNode();
        if (! $node) {
            throw ValidationException::withMessages(['status' => ['The request has no current stage.']]);
        }

        return DB::transaction(function () use ($request, $actor, $assignee, $node): HandoverRequest {
            $this->assertActorCanAct($request, $node, $actor, HandoverActions::ASSIGN);

            if (! $request->responsible_company_id
                || ! $this->accessControlService->userBelongsToCompany($assignee, (int) $request->responsible_company_id)) {
                throw ValidationException::withMessages(['assignee' => ['The assignee must be a member of the responsible party.']]);
            }

            $request->assignee_id = $assignee->id;
            $request->save();

            $this->recordEvent(
                $request,
                $actor,
                HandoverActions::ASSIGN,
                $request->current_stage_order,
                $request->current_stage_order,
                $request->status,
                $request->status,
                null,
                ['assignee_id' => $assignee->id],
            );
            $this->notifyUsers($request, collect([$assignee]), 'assigned', $actor, null);

            return $request->fresh($this->eagerLoads());
        });
    }

    /**
     * Close the request from the final-authority stage, blocked while mandatory
     * snags remain open (BR-FR-034, BR-BR-011/012). Re-shapes TocService::close.
     */
    public function close(HandoverRequest $request, User $actor, array $payload = []): HandoverRequest
    {
        $node = $request->currentStageNode();
        if (! $node || ! ($node['is_final_authority'] ?? false)) {
            throw ValidationException::withMessages(['status' => ['Only the final-authority stage can close a handover request.']]);
        }

        return DB::transaction(function () use ($request, $actor, $node, $payload): HandoverRequest {
            $this->assertActorCanAct($request, $node, $actor, HandoverActions::CLOSE);

            $openMandatory = $request->snags()
                ->wherePivot('is_mandatory', true)
                ->whereNotIn('snags.status', self::TERMINAL_SNAG_STATUSES)
                ->count();

            $isException = (bool) ($payload['is_exception'] ?? false);
            $reason = isset($payload['reason']) ? trim((string) $payload['reason']) : '';

            // BR-BR-011/012 + OD-12: mandatory snags normally block closure. The
            // final authority may override under an approved exception rule, but
            // only with a recorded justification captured on the CLOSE event.
            if ($openMandatory > 0) {
                if (! $isException) {
                    throw ValidationException::withMessages([
                        'closure' => ["{$openMandatory} mandatory snag(s) are still open; the handover cannot be closed."],
                    ]);
                }
                if ($reason === '') {
                    throw ValidationException::withMessages([
                        'reason' => ['A recorded justification is required to close under an exception while mandatory snags remain open.'],
                    ]);
                }
            }

            $priorStage = (int) $request->current_stage_order;
            $priorStatus = $request->status;

            $request->status = HandoverRequest::STATUS_CLOSED;
            $request->closed_by = $actor->id;
            $request->closed_at = now();
            $request->current_stage_order = null;
            $request->stage_due_at = null;
            $request->save();

            $this->recordEvent(
                $request,
                $actor,
                HandoverActions::CLOSE,
                $priorStage,
                null,
                $priorStatus,
                $request->status,
                $reason !== '' ? $reason : null,
                ($openMandatory > 0 && $isException)
                    ? ['is_exception' => true, 'open_mandatory_at_close' => $openMandatory]
                    : [],
            );
            $this->notifyCompanyMembers($request, $request->submitted_by_company_id, 'closed', $actor, null);

            return $request->fresh($this->eagerLoads());
        });
    }

    /**
     * Cancel an in-flight submitted transaction (BR-BR-014). A submitted request
     * can never be deleted; it can only be cancelled — with a mandatory recorded
     * reason — by the party currently responsible for it or by the originating
     * (submitting) party. A draft is discarded through deletion, not cancellation.
     *
     * NOTE (OD-02 / OD-12, still open): the cancel authority defaults here to
     * "responsible or originating party + the handover.cancel verb". Revisit once
     * the final cancel-authority / approver decision is formally confirmed.
     */
    public function cancel(HandoverRequest $request, User $actor, array $payload = []): HandoverRequest
    {
        if ($request->status === HandoverRequest::STATUS_DRAFT) {
            throw ValidationException::withMessages([
                'status' => ['A draft handover request is discarded by deletion, not cancellation.'],
            ]);
        }
        if (in_array($request->status, HandoverRequest::TERMINAL_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => ['This handover request is already closed, rejected or cancelled.'],
            ]);
        }

        $reason = isset($payload['reason']) ? trim((string) $payload['reason']) : '';
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => ['A reason is required to cancel a handover request.'],
            ]);
        }

        return DB::transaction(function () use ($request, $actor, $reason): HandoverRequest {
            $this->assertActorCanCancel($request, $actor);

            $priorStage = $request->current_stage_order !== null ? (int) $request->current_stage_order : null;
            $priorStatus = $request->status;

            $request->status = HandoverRequest::STATUS_CANCELLED;
            $request->current_stage_order = null;
            $request->stage_due_at = null;
            $request->save();

            $this->recordEvent($request, $actor, HandoverActions::CANCEL, $priorStage, null, $priorStatus, $request->status, $reason);

            // Notify the party that held it and the originator (if different).
            $this->notifyCompanyMembers($request, $request->responsible_company_id, 'cancelled', $actor, $reason);
            if ($request->submitted_by_company_id && $request->submitted_by_company_id !== $request->responsible_company_id) {
                $this->notifyCompanyMembers($request, $request->submitted_by_company_id, 'cancelled', $actor, $reason);
            }

            return $request->fresh($this->eagerLoads());
        });
    }

    /**
     * Public gate check: throws AuthorizationException unless the actor may take
     * the given action at the request's current stage. Used by adjacent flows
     * (e.g. requesting an inspection) that piggy-back on the stage gate.
     */
    public function assertCanAct(HandoverRequest $request, User $actor, string $action): void
    {
        $node = $request->currentStageNode();
        if (! $node) {
            throw ValidationException::withMessages(['status' => ['The request has no current stage.']]);
        }

        $this->assertActorCanAct($request, $node, $actor, $action);
    }

    /**
     * Resolve the concrete responsible party (StakeholderCompany) for a stage node
     * and denormalize it onto the request. Party-by-company pin wins; else exactly
     * one active company of the stage's type — 0 or >1 fails loudly.
     */
    public function resolveStageParty(HandoverRequest $request, array $node): int
    {
        if (! empty($node['responsible_company_id'])) {
            $companyId = (int) $node['responsible_company_id'];
        } else {
            $companies = StakeholderCompany::query()
                ->where('organization_id', $request->organization_id)
                ->where('type', $node['responsible_type'] ?? '')
                ->where('is_active', true)
                ->pluck('id');

            if ($companies->count() === 0) {
                throw ValidationException::withMessages([
                    'party' => ["No active '{$node['responsible_type']}' party is configured for this handover."],
                ]);
            }
            if ($companies->count() > 1) {
                throw ValidationException::withMessages([
                    'party' => ["Multiple '{$node['responsible_type']}' parties exist; pin one on the workflow stage."],
                ]);
            }
            $companyId = (int) $companies->first();
        }

        $request->responsible_company_id = $companyId;

        return $companyId;
    }

    /**
     * Whether the request may leave the given stage (BR-FR-008).
     *
     * @return array{ready: bool, missing: array<int, string>}
     */
    public function stageGateReady(HandoverRequest $request, array $node): array
    {
        $missing = [];

        foreach (($node['required_fields'] ?? []) as $field) {
            if (blank($request->{$field} ?? null)) {
                $missing[] = "field: {$field}";
            }
        }

        foreach (($node['required_activities'] ?? []) as $activity) {
            switch ($activity) {
                case 'min_snags_linked':
                    if ($request->snags()->count() < 1) {
                        $missing[] = 'at least one linked snag';
                    }
                    break;
                case 'inspection_required':
                    if ($request->inspectionSubmissions()->count() < 1) {
                        $missing[] = 'a linked inspection submission';
                    }
                    break;
                case 'all_snags_closed':
                    $open = $request->snags()
                        ->wherePivot('is_mandatory', true)
                        ->whereNotIn('snags.status', self::TERMINAL_SNAG_STATUSES)
                        ->count();
                    if ($open > 0) {
                        $missing[] = "{$open} mandatory snag(s) still open";
                    }
                    break;
            }
        }

        return ['ready' => $missing === [], 'missing' => $missing];
    }

    /**
     * A read-only view of what the current stage/party is and what the viewer may
     * do, without attempting a transition (powers UI panels).
     *
     * @return array<string, mixed>
     */
    public function summary(HandoverRequest $request, User $viewer): array
    {
        $node = $request->currentStageNode();
        $gate = $node ? $this->stageGateReady($request, $node) : ['ready' => true, 'missing' => []];
        $permitted = [];

        if ($node) {
            foreach (($node['permitted_actions'] ?? []) as $action) {
                if ($this->actorMayAct($request, $node, $viewer, $action)) {
                    $permitted[] = $action;
                }
            }
        }

        return [
            'current_stage_order' => $request->current_stage_order,
            'current_stage_key' => $node['stage_key'] ?? null,
            'current_stage_name' => $node['name'] ?? null,
            'responsible_company_id' => $request->responsible_company_id,
            'status' => $request->status,
            'cycle_number' => $request->cycle_number,
            'viewer_permitted_actions' => $permitted,
            'gate_ready' => $gate['ready'],
            'gate_missing' => $gate['missing'],
        ];
    }

    public function recordEvent(
        HandoverRequest $request,
        ?User $actor,
        string $action,
        ?int $priorStage,
        ?int $newStage,
        ?string $priorStatus,
        ?string $newStatus,
        ?string $reason,
        array $metadata = [],
    ): void {
        HandoverEvent::query()->create([
            'organization_id' => $request->organization_id,
            'handover_request_id' => $request->id,
            'cycle_number' => $request->cycle_number,
            'actor_id' => $actor?->id,
            'actor_company_id' => $request->responsible_company_id,
            'actor_role' => $actor ? $this->actorRole($request, $actor) : null,
            'action' => $action,
            'prior_stage_order' => $priorStage,
            'new_stage_order' => $newStage,
            'prior_status' => $priorStatus,
            'new_status' => $newStatus,
            'reason' => $reason,
            'metadata' => $metadata !== [] ? $metadata : null,
        ]);
    }

    private function actionEvent(string $action): string
    {
        return match ($action) {
            HandoverActions::FORWARD => 'forwarded',
            HandoverActions::APPROVE => 'approved',
            HandoverActions::RETURN => 'returned',
            HandoverActions::REJECT => 'rejected',
            HandoverActions::REVISE => 'revised',
            HandoverActions::SUBMIT => 'submitted',
            HandoverActions::ASSIGN => 'assigned',
            HandoverActions::CLOSE => 'closed',
            default => $action,
        };
    }

    /**
     * Notify a party that a new comment was posted on a handover request
     * (item 10 / BR-FR-031). Reuses the shared company-member notify path.
     */
    public function notifyCommentPosted(HandoverRequest $request, int $companyId, User $author, ?string $snippet): void
    {
        $this->notifyCompanyMembers($request, $companyId, 'commented', $author, $snippet);
    }

    /**
     * Notify the party currently responsible that its stage has breached SLA
     * (OD-13). Used by {@see HandoverEscalationService}.
     */
    public function notifyStageEscalation(HandoverRequest $request, ?string $reason = null): void
    {
        $this->notifyCompanyMembers($request, $request->responsible_company_id, 'escalated', null, $reason);
    }

    private function notifyCompanyMembers(HandoverRequest $request, ?int $companyId, string $event, ?User $actor, ?string $reason): void
    {
        if (! $companyId) {
            return;
        }

        $company = StakeholderCompany::query()->find($companyId);
        if (! $company) {
            return;
        }

        $this->notifyUsers($request, $company->users()->wherePivot('is_active', true)->get(), $event, $actor, $reason);
    }

    private function notifyUsers(HandoverRequest $request, Collection $users, string $event, ?User $actor, ?string $reason): void
    {
        $recipients = $users
            ->filter(fn (User $user) => $actor === null || $user->id !== $actor->id)
            ->unique('id')
            ->values();

        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients, new HandoverStageNotification($request, $event, $actor, $reason));

        $this->pushNotificationService->sendToUsers(
            $request->organization_id,
            $recipients->all(),
            'Handover '.$event.': '.$request->reference,
            $request->title,
            'esnagging://handovers/'.$request->id,
            [
                'type' => 'handover_stage',
                'event' => $event,
                'handover_request_id' => $request->id,
                'organization_id' => $request->organization_id,
            ],
            'status_change',
        );
    }

    private function resolveDestination(HandoverRequest $request, array $node, string $action): ?int
    {
        $current = (int) $request->current_stage_order;

        return match ($action) {
            HandoverActions::COMMENT => $current,
            HandoverActions::CONSOLIDATE => $this->requireConsolidation($node, $current),
            HandoverActions::FORWARD => $this->forwardDestination($request, $node, $current),
            HandoverActions::APPROVE => $this->approveDestination($request, $node, $current),
            HandoverActions::RETURN, HandoverActions::REJECT, HandoverActions::REVISE => $this->returnDestination($node),
            default => throw ValidationException::withMessages(['action' => ["Unsupported action '{$action}'."]]),
        };
    }

    private function requireConsolidation(array $node, int $current): int
    {
        if (! ($node['requires_consolidation'] ?? false)) {
            throw ValidationException::withMessages(['action' => ['Consolidation is not available at this stage.']]);
        }

        return $current; // in-stage action
    }

    private function forwardDestination(HandoverRequest $request, array $node, int $current): int
    {
        $this->assertGateReady($request, $node);

        return (int) ($node['forward_to_stage'] ?? ($current + 1));
    }

    private function approveDestination(HandoverRequest $request, array $node, int $current): int
    {
        if ($node['is_final_authority'] ?? false) {
            return $current; // approve at final authority stays put, then close()
        }

        $this->assertGateReady($request, $node);

        return (int) ($node['approve_to_stage'] ?? $node['forward_to_stage'] ?? ($current + 1));
    }

    private function returnDestination(array $node): int
    {
        $destination = $node['return_to_stage'] ?? null;
        if ($destination === null) {
            throw ValidationException::withMessages(['action' => ['This stage has no return destination configured.']]);
        }

        return (int) $destination;
    }

    private function moveTo(HandoverRequest $request, int $destinationOrder, string $action): void
    {
        $destinationNode = $request->stageNode($destinationOrder);
        if (! $destinationNode) {
            throw ValidationException::withMessages(['stage' => ["Destination stage {$destinationOrder} does not exist in the snapshot."]]);
        }

        $request->current_stage_order = $destinationOrder;
        $this->resolveStageParty($request, $destinationNode);
        $request->assignee_id = null;
        $request->status = match ($action) {
            HandoverActions::RETURN, HandoverActions::REJECT => HandoverRequest::STATUS_RETURNED,
            HandoverActions::REVISE => HandoverRequest::STATUS_REVISING,
            default => ($destinationNode['is_final_authority'] ?? false)
                ? HandoverRequest::STATUS_APPROVED
                : HandoverRequest::STATUS_IN_PROGRESS,
        };
        // OD-13: (re)start the per-stage SLA clock for the party now holding it.
        $this->applyStageSla($request, $destinationNode);
        $request->save();
    }

    /**
     * Set the stage SLA deadline (OD-13). Uses the stage node's own sla_hours if
     * pinned, else the configured default. A null result disables the clock.
     */
    private function applyStageSla(HandoverRequest $request, array $node): void
    {
        $slaHours = $node['sla_hours'] ?? config('handover.default_sla_hours');
        $request->stage_due_at = ($slaHours !== null && (int) $slaHours > 0)
            ? now()->addHours((int) $slaHours)
            : null;
        $request->last_escalated_at = null;
    }

    private function assertGateReady(HandoverRequest $request, array $node): void
    {
        $gate = $this->stageGateReady($request, $node);
        if (! $gate['ready']) {
            throw ValidationException::withMessages([
                'forward' => ['Cannot proceed — outstanding: '.implode(', ', $gate['missing']).'.'],
            ]);
        }
    }

    private function assertActorCanAct(HandoverRequest $request, array $node, User $actor, string $action): void
    {
        if (! $this->actorMayAct($request, $node, $actor, $action)) {
            throw new AuthorizationException("You are not authorized to {$action} this handover request at the current stage.");
        }
    }

    /**
     * BR-BR-014 cancel authority (see cancel() note on OD-02/OD-12). Three-clause
     * gate lives in the service, NOT a controller/policy: (1) the handover.cancel
     * RBAC verb, (2)+(3) membership of the current responsible party OR the
     * originating (submitting) party. No org-admin bypass.
     */
    private function assertActorCanCancel(HandoverRequest $request, User $actor): void
    {
        if (! $this->accessControlService->allows($actor, $request->organization_id, $request->project_id, HandoverActions::verb(HandoverActions::CANCEL))) {
            throw new AuthorizationException('You are not authorized to cancel this handover request.');
        }

        $eligibleCompanyIds = array_filter([
            $request->responsible_company_id ? (int) $request->responsible_company_id : null,
            $request->submitted_by_company_id ? (int) $request->submitted_by_company_id : null,
        ]);

        foreach ($eligibleCompanyIds as $companyId) {
            if ($this->accessControlService->userBelongsToCompany($actor, $companyId)) {
                return;
            }
        }

        throw new AuthorizationException('Only the responsible or originating party may cancel this handover request.');
    }

    private function actorMayAct(HandoverRequest $request, array $node, User $actor, string $action): bool
    {
        // (1) RBAC verb.
        if (! $this->accessControlService->allows($actor, $request->organization_id, $request->project_id, HandoverActions::verb($action))) {
            return false;
        }

        // (2) The stage must permit this action.
        if (! in_array($action, $node['permitted_actions'] ?? [], true)) {
            return false;
        }

        // (3) The actor must belong to the concrete current-stage party (BR-BR-001).
        if (! $request->responsible_company_id
            || ! $this->accessControlService->userBelongsToCompany($actor, (int) $request->responsible_company_id)) {
            return false;
        }

        // (4) Optional role narrowing within the party.
        if (! empty($node['responsible_role_name'])) {
            $roles = $this->accessControlService->effectiveRoleNames($actor, $request->organization_id, $request->project_id);
            if (! in_array($node['responsible_role_name'], $roles, true)) {
                return false;
            }
        }

        return true;
    }

    private function actorRole(HandoverRequest $request, User $actor): ?string
    {
        $roles = $this->accessControlService->effectiveRoleNames($actor, $request->organization_id, $request->project_id);

        return $roles[0] ?? null;
    }

    /**
     * @return array<int, string>
     */
    private function eagerLoads(): array
    {
        return [
            'responsibleCompany:id,name,code,type',
            'assignee:id,name,email',
            'project:id,name,code',
            'events' => fn ($query) => $query->with('actor:id,name,email')->orderBy('created_at'),
        ];
    }
}
