<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Events\SnagStatusChanged;
use App\Models\Snag;
use App\Models\SnagStatusHistory;
use App\Models\User;
use App\Models\WorkflowAutomationRule;
use App\Support\SnagWorkflow;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class SnagTransitionService
{
    public function __construct(
        private readonly CloseoutService $closeoutService,
        private readonly AccessControlService $accessControlService,
        private readonly SnagCollaborationService $snagCollaborationService,
        private readonly WorkflowAutomationService $workflowAutomationService,
    ) {
    }

    public function transition(Snag $snag, User $actor, string $toStatus, ?string $note = null, ?int $assignedToId = null): Snag
    {
        $fromStatus = $snag->status;

        if (! SnagWorkflow::canTransition($fromStatus, $toStatus)) {
            throw ValidationException::withMessages([
                'to_status' => ['Invalid status transition for the current snag state.'],
            ]);
        }

        $assignedToUser = null;
        if ($assignedToId !== null) {
            if (! $this->accessControlService->allows($actor, $snag->organization_id, $snag->project_id, 'snags.assign')) {
                abort(403, 'You do not have permission to assign snags.');
            }

            if ($assignedToId > 0) {
                $assignedToUser = User::query()->findOrFail($assignedToId);
                if (! $assignedToUser->organizations()->where('organizations.id', $snag->organization_id)->exists()) {
                    throw ValidationException::withMessages([
                        'assigned_to' => ['Assignee is not a member of this organization.'],
                    ]);
                }

                $snag->assigned_to = $assignedToUser->id;
            } else {
                $snag->assigned_to = null;
            }
        }

        if ($toStatus === SnagStatus::Assigned->value && ! $snag->assigned_to) {
            throw ValidationException::withMessages([
                'assigned_to' => ['Assigned status requires an assignee.'],
            ]);
        }

        if (
            $toStatus === SnagStatus::Closed->value
            && ! $this->accessControlService->allows($actor, $snag->organization_id, $snag->project_id, 'snags.close.override')
        ) {
            if (! $this->closeoutService->canCloseSnag($snag)) {
                throw ValidationException::withMessages([
                    'to_status' => ['Closeout must be 100% complete (including required evidence) before closing this snag.'],
                ]);
            }
        }

        $snag->status = $toStatus;
        if ($toStatus === SnagStatus::Assigned->value && ! $snag->acknowledged_at) {
            $snag->acknowledged_at = Carbon::now();
        }

        if ($toStatus === SnagStatus::InProgress->value) {
            $snag->acknowledged_at = $snag->acknowledged_at ?: Carbon::now();
            $snag->started_at = $snag->started_at ?: Carbon::now();
        }

        if ($toStatus === SnagStatus::ReadyForReview->value) {
            $snag->acknowledged_at = $snag->acknowledged_at ?: Carbon::now();
            $snag->started_at = $snag->started_at ?: Carbon::now();
            $snag->ready_for_review_at = $snag->ready_for_review_at ?: Carbon::now();
        }

        if ($toStatus === SnagStatus::Closed->value) {
            $snag->acknowledged_at = $snag->acknowledged_at ?: Carbon::now();
            $snag->started_at = $snag->started_at ?: Carbon::now();
            $snag->ready_for_review_at = $snag->ready_for_review_at ?: Carbon::now();
        }

        $snag->closed_at = $toStatus === SnagStatus::Closed->value ? Carbon::now() : null;
        $snag->save();

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $actor->id);

        SnagStatusHistory::query()->create([
            'snag_id' => $snag->id,
            'organization_id' => $snag->organization_id,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'changed_by' => $actor->id,
            'note' => $note,
        ]);

        $this->workflowAutomationService->applyForSnag($snag, $actor, WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED, [
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
        ]);
        $snag->refresh();

        event(new SnagStatusChanged($snag->fresh(['project', 'creator', 'assignee']), $actor, $fromStatus, $toStatus));

        return $snag->fresh([
            'assignee:id,name,email',
            'creator:id,name,email',
            'statusHistory' => fn ($query) => $query->with('changedBy:id,name,email')->orderByDesc('created_at'),
            'closeoutInstance.items.evidences',
        ]);
    }
}
