<?php

namespace App\Services;

use App\Events\InspectionRealtimeMessage;
use App\Models\InspectionApproval;
use App\Models\InspectionApprovalMessage;
use App\Models\InspectionSignature;
use App\Models\InspectionSubmission;
use App\Models\User;
use App\Notifications\InspectionApprovalRequiredNotification;
use App\Notifications\InspectionDecisionNotification;
use App\Notifications\InspectionSignatureRequestedNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InspectionApprovalService
{
    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
        private readonly AccessControlService $accessControlService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function submit(InspectionSubmission $submission, User $actor): InspectionSubmission
    {
        if ($submission->status !== InspectionSubmission::STATUS_DRAFT) {
            throw ValidationException::withMessages([
                'status' => ['Only draft submissions can be submitted for review.'],
            ]);
        }

        $submission->loadMissing('template');

        $approvals = $this->createApprovalsFromTemplate($submission);
        $firstPending = $approvals->firstWhere('status', InspectionApproval::STATUS_PENDING);

        $submission->status = $firstPending
            ? InspectionSubmission::STATUS_SUBMITTED
            : InspectionSubmission::STATUS_APPROVED;
        $submission->submitted_by = $actor->id;
        $submission->submitted_at = Carbon::now();
        $submission->current_approval_order = $firstPending?->step_order;
        $submission->approved_at = $firstPending ? null : Carbon::now();
        $submission->rejected_at = null;
        $submission->last_updated_by = $actor->id;
        $submission->save();

        $this->logMessage(
            $submission,
            null,
            $actor,
            'submitted',
            'Submission moved to review workflow.',
            [
                'current_approval_order' => $submission->current_approval_order,
                'status' => $submission->status,
            ],
        );

        if ($firstPending) {
            $this->logMessage(
                $submission,
                $firstPending,
                null,
                'step_pending',
                sprintf('Pending step #%d: %s', $firstPending->step_order, $firstPending->step_name ?: $firstPending->role_name),
                [
                    'step_order' => $firstPending->step_order,
                    'role_name' => $firstPending->role_name,
                    'requires_signature' => $firstPending->requires_signature,
                ],
            );
            $this->notifyCurrentStep($submission, $firstPending);
        } else {
            $this->notifyDecisionParticipants($submission, null, $actor);
        }

        $this->broadcast($submission, 'submitted');

        return $submission->fresh([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
        ]);
    }

    public function review(InspectionSubmission $submission, User $actor, string $decision, ?string $notes = null): InspectionSubmission
    {
        if (! in_array($submission->status, [InspectionSubmission::STATUS_IN_REVIEW, InspectionSubmission::STATUS_SUBMITTED], true)) {
            throw ValidationException::withMessages([
                'status' => ['Submission is not currently in review.'],
            ]);
        }

        $current = $this->currentPendingApproval($submission);
        if (! $current) {
            throw ValidationException::withMessages([
                'status' => ['No pending approval step found.'],
            ]);
        }

        $this->assertActorCanAct($submission, $current, $actor);

        if ($decision === 'approve') {
            if ($current->requires_signature && ! $this->hasSignatureForStep($current, $actor->id)) {
                throw ValidationException::withMessages([
                    'signature' => ['Digital signature is required before approving this step.'],
                ]);
            }

            $current->status = InspectionApproval::STATUS_APPROVED;
            $current->approver_id = $actor->id;
            $current->decision_notes = $notes;
            $current->acted_at = Carbon::now();
            $current->save();

            $this->logMessage(
                $submission,
                $current,
                $actor,
                'decision_approve',
                $notes ?: 'Approved.',
                [
                    'step_order' => $current->step_order,
                    'role_name' => $current->role_name,
                ],
            );

            $this->notifyDecisionParticipants($submission, $current, $actor);

            $next = $this->currentPendingApproval($submission->fresh('approvals'));
            if ($next) {
                $submission->status = InspectionSubmission::STATUS_IN_REVIEW;
                $submission->current_approval_order = $next->step_order;
                $submission->approved_at = null;
                $submission->rejected_at = null;
                $submission->last_updated_by = $actor->id;
                $submission->save();

                $this->logMessage(
                    $submission,
                    $next,
                    null,
                    'step_pending',
                    sprintf('Pending step #%d: %s', $next->step_order, $next->step_name ?: $next->role_name),
                    [
                        'step_order' => $next->step_order,
                        'role_name' => $next->role_name,
                        'requires_signature' => $next->requires_signature,
                    ],
                );

                $this->notifyCurrentStep($submission, $next);
            } else {
                $submission->status = InspectionSubmission::STATUS_APPROVED;
                $submission->current_approval_order = null;
                $submission->approved_at = Carbon::now();
                $submission->rejected_at = null;
                $submission->last_updated_by = $actor->id;
                $submission->save();

                $this->logMessage(
                    $submission,
                    $current,
                    null,
                    'submission_approved',
                    'Submission fully approved.',
                    null,
                );
            }

            $this->broadcast($submission, 'approval_approved');
        } elseif ($decision === 'reject') {
            $current->status = InspectionApproval::STATUS_REJECTED;
            $current->approver_id = $actor->id;
            $current->decision_notes = $notes;
            $current->acted_at = Carbon::now();
            $current->save();

            $this->logMessage(
                $submission,
                $current,
                $actor,
                'decision_reject',
                $notes ?: 'Rejected.',
                [
                    'step_order' => $current->step_order,
                    'role_name' => $current->role_name,
                ],
            );

            $submission->status = InspectionSubmission::STATUS_REJECTED;
            $submission->rejected_at = Carbon::now();
            $submission->approved_at = null;
            $submission->current_approval_order = null;
            $submission->last_updated_by = $actor->id;
            $submission->save();

            $this->logMessage(
                $submission,
                $current,
                null,
                'submission_rejected',
                'Submission was rejected.',
                null,
            );

            $this->notifyDecisionParticipants($submission, $current, $actor);
            $this->broadcast($submission, 'approval_rejected');
        } else {
            throw ValidationException::withMessages([
                'decision' => ['Invalid decision type.'],
            ]);
        }

        return $submission->fresh([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
        ]);
    }

    public function captureSignature(
        InspectionSubmission $submission,
        User $actor,
        string $signatureDataUrl,
        ?InspectionApproval $approval = null,
        ?string $context = null
    ): InspectionSubmission {
        if (! in_array($submission->status, [InspectionSubmission::STATUS_IN_REVIEW, InspectionSubmission::STATUS_SUBMITTED], true)) {
            throw ValidationException::withMessages([
                'status' => ['Submission is not currently in review.'],
            ]);
        }

        $approval = $approval ?: $this->currentPendingApproval($submission);
        if (! $approval) {
            throw ValidationException::withMessages([
                'approval' => ['No pending approval step found for signature.'],
            ]);
        }

        $this->assertActorCanAct($submission, $approval, $actor);

        if (! $approval->requires_signature) {
            throw ValidationException::withMessages([
                'approval' => ['Current approval step does not require a digital signature.'],
            ]);
        }

        $binary = $this->decodeSignatureDataUrl($signatureDataUrl);
        $path = sprintf(
            'inspections/org_%d/submission_%d/signatures/%s.png',
            $submission->organization_id,
            $submission->id,
            Str::uuid()->toString()
        );
        $submission->loadMissing('organization');
        $organization = $submission->organization;

        if (! $organization) {
            throw ValidationException::withMessages([
                'organization' => ['Inspection submission organization context is missing.'],
            ]);
        }

        try {
            $this->usageLimitService->assertCanConsumeStorage($organization, strlen($binary));
            Storage::disk('public')->put($path, $binary);
        } catch (\Throwable $exception) {
            $this->opsHealthService->recordStorageFailure(
                $submission->organization_id,
                'inspection_signature',
                $exception->getMessage(),
                [
                    'inspection_submission_id' => $submission->id,
                    'inspection_approval_id' => $approval->id,
                    'signed_by' => $actor->id,
                ],
            );

            throw $exception;
        }

        InspectionSignature::query()->create([
            'organization_id' => $submission->organization_id,
            'inspection_submission_id' => $submission->id,
            'inspection_approval_id' => $approval->id,
            'signed_by' => $actor->id,
            'context' => $context ?: 'approval_step',
            'file_name' => basename($path),
            'file_path' => $path,
            'mime_type' => 'image/png',
            'file_size' => strlen($binary),
            'signed_at' => Carbon::now(),
            'metadata' => ['source' => 'canvas_data_url'],
        ]);

        $approval->status = InspectionApproval::STATUS_APPROVED;
        $approval->approver_id = $actor->id;
        $approval->decision_notes = trim(($approval->decision_notes ? $approval->decision_notes.' ' : '').'Digitally signed.');
        $approval->acted_at = Carbon::now();
        $approval->save();

        $this->logMessage(
            $submission,
            $approval,
            $actor,
            'signature_captured',
            'Digital signature captured for approval step.',
            [
                'step_order' => $approval->step_order,
                'role_name' => $approval->role_name,
                'signature_context' => $context ?: 'approval_step',
            ],
        );

        $this->notifyDecisionParticipants($submission, $approval, $actor);

        $next = $this->currentPendingApproval($submission->fresh('approvals'));
        if ($next) {
            $submission->status = InspectionSubmission::STATUS_IN_REVIEW;
            $submission->current_approval_order = $next->step_order;
            $submission->approved_at = null;
            $submission->rejected_at = null;
            $submission->last_updated_by = $actor->id;
            $submission->save();

            $this->logMessage(
                $submission,
                $next,
                null,
                'step_pending',
                sprintf('Pending step #%d: %s', $next->step_order, $next->step_name ?: $next->role_name),
                [
                    'step_order' => $next->step_order,
                    'role_name' => $next->role_name,
                    'requires_signature' => $next->requires_signature,
                ],
            );

            $this->notifyCurrentStep($submission, $next);
        } else {
            $submission->status = InspectionSubmission::STATUS_APPROVED;
            $submission->current_approval_order = null;
            $submission->approved_at = Carbon::now();
            $submission->rejected_at = null;
            $submission->last_updated_by = $actor->id;
            $submission->save();

            $this->logMessage(
                $submission,
                $approval,
                null,
                'submission_approved',
                'Submission fully approved.',
                null,
            );
        }

        $this->broadcast($submission, 'signature_captured');

        return $submission->fresh([
            'template',
            'approvals.approver:id,name,email',
            'signatures.signer:id,name,email',
            'approvalMessages.user:id,name,email',
            'approvalMessages.approval:id,inspection_submission_id,step_order,step_name,role_name,status',
            'creator:id,name,email',
            'submitter:id,name,email',
            'project:id,name,code',
        ]);
    }

    public function createApprovalsFromTemplate(InspectionSubmission $submission): Collection
    {
        $submission->loadMissing('template', 'approvals');

        if ($submission->approvals->isNotEmpty()) {
            return $submission->approvals->sortBy('step_order')->values();
        }

        $workflow = collect($submission->template?->approval_workflow ?: [])
            ->filter(fn ($step) => is_array($step))
            ->values();

        if ($workflow->isEmpty()) {
            $workflow = collect([
                [
                    'step_order' => 1,
                    'step_name' => 'Inspector Review',
                    'role_name' => 'inspector',
                    'requires_signature' => false,
                ],
            ]);
        }

        foreach ($workflow as $index => $step) {
            $submission->approvals()->create([
                'organization_id' => $submission->organization_id,
                'step_order' => (int) ($step['step_order'] ?? ($index + 1)),
                'step_name' => (string) ($step['step_name'] ?? 'Step '.($index + 1)),
                'role_name' => (string) ($step['role_name'] ?? 'inspector'),
                'requires_signature' => (bool) ($step['requires_signature'] ?? false),
                'status' => InspectionApproval::STATUS_PENDING,
            ]);
        }

        return $submission->approvals()->orderBy('step_order')->get();
    }

    public function currentPendingApproval(InspectionSubmission $submission): ?InspectionApproval
    {
        return $submission->approvals()
            ->where('status', InspectionApproval::STATUS_PENDING)
            ->orderBy('step_order')
            ->first();
    }

    private function assertActorCanAct(InspectionSubmission $submission, InspectionApproval $approval, User $actor): void
    {
        $effectiveRoles = $this->accessControlService->effectiveRoleNames($actor, $submission->organization_id, $submission->project_id);
        $isOrgAdmin = in_array('org_admin', $effectiveRoles, true) || in_array('owner', $effectiveRoles, true);
        $hasStepRole = in_array($approval->role_name, $effectiveRoles, true);
        $delegatedApprover = $this->delegatedApprover($submission, $approval, $actor);

        if (! $isOrgAdmin && ! $hasStepRole && ! $delegatedApprover) {
            throw ValidationException::withMessages([
                'approval' => ['You are not authorized to act on the current approval step.'],
            ]);
        }

        if (! $actor->organizations()->where('organizations.id', $submission->organization_id)->exists()) {
            throw ValidationException::withMessages([
                'approval' => ['You are not a member of this organization.'],
            ]);
        }
    }

    private function hasSignatureForStep(InspectionApproval $approval, int $signedByUserId): bool
    {
        return $approval->signatures()
            ->where('signed_by', $signedByUserId)
            ->exists();
    }

    private function decodeSignatureDataUrl(string $signatureDataUrl): string
    {
        if (! preg_match('/^data:image\/png;base64,/', $signatureDataUrl)) {
            throw ValidationException::withMessages([
                'signature_data' => ['Signature must be a PNG base64 data URL.'],
            ]);
        }

        $data = substr($signatureDataUrl, strpos($signatureDataUrl, ',') + 1);
        $decoded = base64_decode($data, true);

        if ($decoded === false || $decoded === '') {
            throw ValidationException::withMessages([
                'signature_data' => ['Invalid signature payload.'],
            ]);
        }

        return $decoded;
    }

    private function notifyCurrentStep(InspectionSubmission $submission, InspectionApproval $approval): void
    {
        $submission->loadMissing(['creator', 'submitter']);

        $candidates = User::query()
            ->whereHas('organizations', function ($query) use ($submission): void {
                $query->where('organizations.id', $submission->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->get()
            ->filter(function (User $user) use ($submission, $approval): bool {
                $roles = $this->accessControlService->effectiveRoleNames($user, $submission->organization_id, $submission->project_id);

                return in_array($approval->role_name, $roles, true)
                    || in_array('org_admin', $roles, true)
                    || in_array('owner', $roles, true);
            });

        if ($approval->requires_signature) {
            $this->logMessage(
                $submission,
                $approval,
                null,
                'signature_requested',
                sprintf('Signature requested for step #%d.', $approval->step_order),
                [
                    'step_order' => $approval->step_order,
                    'role_name' => $approval->role_name,
                ],
            );
        }

        foreach ($candidates as $candidate) {
            $candidate->notify(new InspectionApprovalRequiredNotification($submission, $approval));

            $this->pushNotificationService->sendToUsers(
                $submission->organization_id,
                [$candidate],
                'Inspection Approval Needed',
                $submission->reference.' is waiting for your review.',
                'esnagging://inspections/submissions/'.$submission->id,
                [
                    'type' => 'inspection_approval_required',
                    'inspection_submission_id' => $submission->id,
                    'inspection_reference' => $submission->reference,
                    'approval_id' => $approval->id,
                    'organization_id' => $submission->organization_id,
                ],
                'approval_needed',
            );

            if ($approval->requires_signature) {
                $candidate->notify(new InspectionSignatureRequestedNotification($submission, $approval));

                $this->pushNotificationService->sendToUsers(
                    $submission->organization_id,
                    [$candidate],
                    'Inspection Signature Requested',
                    $submission->reference.' requires your digital signature.',
                    'esnagging://inspections/submissions/'.$submission->id,
                    [
                        'type' => 'inspection_signature_requested',
                        'inspection_submission_id' => $submission->id,
                        'inspection_reference' => $submission->reference,
                        'approval_id' => $approval->id,
                        'organization_id' => $submission->organization_id,
                    ],
                    'signature_requested',
                );
            }
        }
    }

    private function notifyDecisionParticipants(InspectionSubmission $submission, ?InspectionApproval $approval, User $actor): void
    {
        $submission->loadMissing(['creator', 'submitter']);

        if (! $approval) {
            return;
        }

        collect([$submission->creator, $submission->submitter])
            ->filter()
            ->unique('id')
            ->reject(fn (User $user) => $user->id === $actor->id)
            ->each(function (User $user) use ($submission, $approval, $actor): void {
                $user->notify(new InspectionDecisionNotification($submission, $approval, $actor));

                $this->pushNotificationService->sendToUsers(
                    $submission->organization_id,
                    [$user],
                    'Inspection Decision Updated',
                    sprintf('%s step %d is %s.', $submission->reference, $approval->step_order, $approval->status),
                    'esnagging://inspections/submissions/'.$submission->id,
                    [
                        'type' => 'inspection_decision',
                        'inspection_submission_id' => $submission->id,
                        'inspection_reference' => $submission->reference,
                        'approval_id' => $approval->id,
                        'approval_status' => $approval->status,
                        'organization_id' => $submission->organization_id,
                    ],
                    'approval_needed',
                );
            });
    }

    private function broadcast(InspectionSubmission $submission, string $action): void
    {
        event(new InspectionRealtimeMessage($submission->organization_id, [
            'action' => $action,
            'inspection_submission_id' => $submission->id,
            'reference' => $submission->reference,
            'status' => $submission->status,
            'project_id' => $submission->project_id,
        ]));
    }

    private function delegatedApprover(InspectionSubmission $submission, InspectionApproval $approval, User $actor): ?User
    {
        $rules = $this->accessControlService->activeDelegationRules(
            $actor->id,
            $submission->organization_id,
            $submission->project_id,
        );

        foreach ($rules as $rule) {
            if (! in_array($rule->scope, ['all', 'approvals'], true)) {
                continue;
            }

            $delegator = $rule->delegator;
            if (! $delegator) {
                continue;
            }

            $delegatorRoles = $this->accessControlService->effectiveRoleNames(
                $delegator,
                $submission->organization_id,
                $submission->project_id,
            );

            if (
                in_array($approval->role_name, $delegatorRoles, true)
                || in_array('org_admin', $delegatorRoles, true)
                || in_array('owner', $delegatorRoles, true)
            ) {
                return $delegator;
            }
        }

        return null;
    }

    private function logMessage(
        InspectionSubmission $submission,
        ?InspectionApproval $approval,
        ?User $actor,
        string $messageType,
        string $body,
        ?array $payload,
    ): void {
        InspectionApprovalMessage::query()->create([
            'organization_id' => $submission->organization_id,
            'inspection_submission_id' => $submission->id,
            'inspection_approval_id' => $approval?->id,
            'user_id' => $actor?->id,
            'message_type' => $messageType,
            'body' => $body,
            'payload' => $payload,
        ]);
    }
}
