<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Events\SnagRealtimeMessage;
use App\Models\Snag;
use App\Models\SnagStatusHistory;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Models\WorkflowAutomationLog;
use App\Models\WorkflowAutomationRule;
use App\Notifications\SnagAssignedNotification;
use App\Notifications\SnagWorkflowEscalatedNotification;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;

class WorkflowAutomationService
{
    /**
     * @return array{rules_checked:int, rules_applied:int, escalations:int, errors:int}
     */
    public function applyForSnag(
        Snag $snag,
        User $actor,
        string $triggerEvent,
        array $context = [],
    ): array {
        $stats = [
            'rules_checked' => 0,
            'rules_applied' => 0,
            'escalations' => 0,
            'errors' => 0,
        ];

        $rules = WorkflowAutomationRule::query()
            ->where('organization_id', $snag->organization_id)
            ->where('trigger_event', $triggerEvent)
            ->where('is_active', true)
            ->where(function ($query) use ($snag): void {
                $query->whereNull('project_id')
                    ->orWhere('project_id', $snag->project_id);
            })
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        foreach ($rules as $rule) {
            $stats['rules_checked']++;

            if (! $this->conditionsMatch($rule, $snag, $context)) {
                continue;
            }

            if ($rule->run_once_per_snag && $this->alreadyApplied($rule, $snag)) {
                $this->logExecution(
                    $rule,
                    $snag,
                    $actor,
                    $triggerEvent,
                    'skipped',
                    'Rule configured to run once per snag and was already applied.',
                    null,
                );
                continue;
            }

            try {
                $resultPayload = $this->executeActions($rule, $snag, $actor, $context);

                $this->logExecution(
                    $rule,
                    $snag,
                    $actor,
                    $triggerEvent,
                    'applied',
                    'Rule conditions matched and actions executed.',
                    $resultPayload,
                );

                $rule->forceFill([
                    'last_triggered_at' => now(),
                    'trigger_count' => (int) $rule->trigger_count + 1,
                ])->save();

                $stats['rules_applied']++;
                $stats['escalations'] += (int) ($resultPayload['escalated_count'] ?? 0);
            } catch (\Throwable $exception) {
                $stats['errors']++;

                $this->logExecution(
                    $rule,
                    $snag,
                    $actor,
                    $triggerEvent,
                    'error',
                    $exception->getMessage(),
                    [
                        'context' => $context,
                    ],
                );
            }
        }

        return $stats;
    }

    private function alreadyApplied(WorkflowAutomationRule $rule, Snag $snag): bool
    {
        return WorkflowAutomationLog::query()
            ->where('workflow_automation_rule_id', $rule->id)
            ->where('snag_id', $snag->id)
            ->where('result', 'applied')
            ->exists();
    }

    private function conditionsMatch(WorkflowAutomationRule $rule, Snag $snag, array $context): bool
    {
        $conditions = $rule->conditions ?? [];

        if ($conditions === []) {
            return true;
        }

        if (array_key_exists('trade', $conditions)) {
            $allowedTrades = $this->normalizeStringArray($conditions['trade']);
            if ($allowedTrades !== [] && ! in_array(strtolower((string) $snag->trade), $allowedTrades, true)) {
                return false;
            }
        }

        if (array_key_exists('priority', $conditions)) {
            $allowedPriorities = $this->normalizeStringArray($conditions['priority']);
            if ($allowedPriorities !== [] && ! in_array(strtolower((string) $snag->priority), $allowedPriorities, true)) {
                return false;
            }
        }

        if (array_key_exists('status', $conditions)) {
            $allowedStatuses = $this->normalizeStringArray($conditions['status']);
            if ($allowedStatuses !== [] && ! in_array(strtolower((string) $snag->status), $allowedStatuses, true)) {
                return false;
            }
        }

        if (array_key_exists('rejection_count_gte', $conditions)) {
            $rejectionCount = $this->rejectionCount($snag);
            if ($rejectionCount < max(1, (int) $conditions['rejection_count_gte'])) {
                return false;
            }
        }

        if (array_key_exists('status_changed_to', $conditions)) {
            $statusChangedTo = strtolower((string) ($context['to_status'] ?? ''));
            $targetStatuses = $this->normalizeStringArray($conditions['status_changed_to']);

            if ($targetStatuses !== [] && ! in_array($statusChangedTo, $targetStatuses, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function executeActions(WorkflowAutomationRule $rule, Snag $snag, User $actor, array $context): array
    {
        $actions = $rule->actions ?? [];
        if (! is_array($actions) || $actions === []) {
            throw new \RuntimeException('Automation rule has no executable actions.');
        }

        $previousStatus = $snag->status;
        $previousAssigneeId = $snag->assigned_to;
        $appliedChanges = [];

        if (Arr::exists($actions, 'assign_company_id')) {
            $company = $this->resolveCompany((int) $actions['assign_company_id'], $snag);
            $snag->assigned_company_id = $company->id;
            $appliedChanges['assigned_company_id'] = $company->id;
        }

        if (Arr::exists($actions, 'assign_team_id')) {
            $team = $this->resolveTeam((int) $actions['assign_team_id'], $snag);
            $snag->assigned_team_id = $team->id;
            $appliedChanges['assigned_team_id'] = $team->id;

            if (! Arr::exists($actions, 'assign_company_id') && $team->company_id) {
                $snag->assigned_company_id = $team->company_id;
                $appliedChanges['assigned_company_id'] = $team->company_id;
            }
        }

        if (Arr::exists($actions, 'assign_user_id')) {
            $assignee = $this->resolveAssignee((int) $actions['assign_user_id'], $snag);
            $snag->assigned_to = $assignee->id;
            $appliedChanges['assigned_to'] = $assignee->id;
        }

        if (Arr::exists($actions, 'due_in_hours')) {
            $hours = max(1, (int) $actions['due_in_hours']);
            $snag->due_date = now()->addHours($hours)->toDateString();
            $appliedChanges['due_date'] = $snag->due_date;
        }

        if (($snag->assigned_to || $snag->assigned_company_id || $snag->assigned_team_id) && $snag->status === SnagStatus::New->value) {
            $snag->status = SnagStatus::Assigned->value;
            $snag->acknowledged_at = $snag->acknowledged_at ?: now();
            $appliedChanges['status'] = $snag->status;
        }

        if ($snag->isDirty()) {
            $snag->save();
            $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $actor->id);

            if ($previousStatus !== $snag->status) {
                SnagStatusHistory::query()->create([
                    'snag_id' => $snag->id,
                    'organization_id' => $snag->organization_id,
                    'from_status' => $previousStatus,
                    'to_status' => $snag->status,
                    'changed_by' => $actor->id,
                    'note' => sprintf('Automation rule "%s" updated snag.', $rule->name),
                    'metadata' => [
                        'automation_rule_id' => $rule->id,
                        'trigger_event' => $rule->trigger_event,
                        'context' => $context,
                    ],
                ]);
            }

            if ($snag->assigned_to && $snag->assigned_to !== $previousAssigneeId && $snag->assigned_to !== $actor->id) {
                $newAssignee = User::query()->find($snag->assigned_to);
                if ($newAssignee) {
                    $newAssignee->notify(new SnagAssignedNotification($snag->loadMissing('project'), $actor));
                }
            }

            event(new SnagRealtimeMessage($snag->organization_id, [
                'action' => 'automation_updated',
                'snag_id' => $snag->id,
                'reference' => $snag->reference,
                'status' => $snag->status,
                'assigned_to' => $snag->assigned_to,
                'assigned_company_id' => $snag->assigned_company_id,
                'assigned_team_id' => $snag->assigned_team_id,
                'due_date' => $snag->due_date,
                'project_id' => $snag->project_id,
                'rule_id' => $rule->id,
            ]));
        }

        $escalatedUserIds = $this->executeEscalationAction($rule, $snag, $actor, $actions);

        return [
            'changes' => $appliedChanges,
            'escalated_user_ids' => $escalatedUserIds,
            'escalated_count' => count($escalatedUserIds),
        ];
    }

    /**
     * @param  array<string, mixed>  $actions
     * @return array<int, int>
     */
    private function executeEscalationAction(
        WorkflowAutomationRule $rule,
        Snag $snag,
        User $actor,
        array $actions,
    ): array {
        $escalateToRoles = $this->normalizeStringArray($actions['escalate_to_roles'] ?? []);
        if ($escalateToRoles === []) {
            return [];
        }

        $recipients = $this->resolveRecipientsByRoles($snag, collect($escalateToRoles))
            ->reject(fn (User $user) => $user->id === $actor->id)
            ->values();

        if ($recipients->isEmpty()) {
            return [];
        }

        $reason = sprintf('Automation rule "%s" escalated this snag.', $rule->name);

        foreach ($recipients as $recipient) {
            $this->snagCollaborationService->addWatchers(
                $snag,
                [$recipient->id],
                SnagCollaborationService::WATCH_SOURCE_ESCALATION,
                $actor->id,
            );

            $recipient->notify(new SnagWorkflowEscalatedNotification($snag, $rule, $reason));
        }

        $this->pushNotificationService->sendToUsers(
            $snag->organization_id,
            $recipients,
            'Snag Escalated by Workflow',
            $snag->reference.' was escalated for review.',
            'esnagging://snags/'.$snag->id,
            [
                'type' => 'snag_workflow_escalated',
                'snag_id' => $snag->id,
                'snag_reference' => $snag->reference,
                'rule_id' => $rule->id,
                'rule_name' => $rule->name,
                'organization_id' => $snag->organization_id,
            ],
            'immediate_escalation',
        );

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'automation_escalated',
            'snag_id' => $snag->id,
            'reference' => $snag->reference,
            'project_id' => $snag->project_id,
            'rule_id' => $rule->id,
            'recipient_ids' => $recipients->pluck('id')->values()->all(),
        ]));

        return $recipients->pluck('id')->values()->all();
    }

    private function resolveCompany(int $companyId, Snag $snag): StakeholderCompany
    {
        $company = StakeholderCompany::query()->findOrFail($companyId);
        if ($company->organization_id !== $snag->organization_id) {
            throw new \RuntimeException('Automation company assignment must belong to the snag organization.');
        }

        return $company;
    }

    private function resolveTeam(int $teamId, Snag $snag): StakeholderTeam
    {
        $team = StakeholderTeam::query()->findOrFail($teamId);
        if ($team->organization_id !== $snag->organization_id) {
            throw new \RuntimeException('Automation team assignment must belong to the snag organization.');
        }

        if ($team->project_id !== null && $team->project_id !== $snag->project_id) {
            throw new \RuntimeException('Automation team assignment must match the snag project.');
        }

        return $team;
    }

    private function resolveAssignee(int $assigneeId, Snag $snag): User
    {
        $assignee = User::query()->findOrFail($assigneeId);
        if (! $assignee->organizations()->where('organizations.id', $snag->organization_id)->exists()) {
            throw new \RuntimeException('Automation assignee must belong to the snag organization.');
        }

        return $assignee;
    }

    /**
     * @param  Collection<int, string>  $roleNames
     * @return Collection<int, User>
     */
    private function resolveRecipientsByRoles(Snag $snag, Collection $roleNames): Collection
    {
        $normalizedRoles = $roleNames
            ->map(fn ($role) => strtolower(trim((string) $role)))
            ->filter()
            ->unique()
            ->values();

        if ($normalizedRoles->isEmpty()) {
            return collect();
        }

        return User::query()
            ->whereHas('organizations', function ($query) use ($snag): void {
                $query->where('organizations.id', $snag->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->get()
            ->filter(function (User $user) use ($snag, $normalizedRoles): bool {
                $effectiveRoles = collect(
                    $this->accessControlService->effectiveRoleNames($user, $snag->organization_id, $snag->project_id)
                )
                    ->map(fn ($role) => strtolower(trim((string) $role)))
                    ->filter()
                    ->unique()
                    ->values();

                return $effectiveRoles->intersect($normalizedRoles)->isNotEmpty();
            })
            ->values();
    }

    /**
     * @param  mixed  $value
     * @return array<int, string>
     */
    private function normalizeStringArray(mixed $value): array
    {
        return collect(Arr::wrap($value))
            ->map(fn ($item) => strtolower(trim((string) $item)))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function rejectionCount(Snag $snag): int
    {
        return SnagStatusHistory::query()
            ->where('snag_id', $snag->id)
            ->where('to_status', SnagStatus::Rejected->value)
            ->count();
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    private function logExecution(
        WorkflowAutomationRule $rule,
        Snag $snag,
        User $actor,
        string $triggerEvent,
        string $result,
        ?string $message,
        ?array $payload,
    ): void {
        WorkflowAutomationLog::query()->create([
            'organization_id' => $snag->organization_id,
            'workflow_automation_rule_id' => $rule->id,
            'snag_id' => $snag->id,
            'triggered_by' => $actor->id,
            'trigger_event' => $triggerEvent,
            'result' => $result,
            'message' => $message,
            'payload' => $payload,
            'executed_at' => now(),
        ]);
    }

    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly SnagCollaborationService $snagCollaborationService,
        private readonly PushNotificationService $pushNotificationService,
    ) {
    }
}
