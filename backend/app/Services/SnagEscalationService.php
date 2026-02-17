<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Events\SnagRealtimeMessage;
use App\Models\Snag;
use App\Models\SnagEscalation;
use App\Models\SnagEscalationRule;
use App\Models\User;
use App\Notifications\SnagEscalatedNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class SnagEscalationService
{
    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly SnagCollaborationService $snagCollaborationService,
        private readonly PushNotificationService $pushNotificationService,
    ) {
    }

    /**
     * @return array{rules:int, snags:int, escalations:int, skipped:int}
     */
    public function evaluate(?int $organizationId = null): array
    {
        $stats = [
            'rules' => 0,
            'snags' => 0,
            'escalations' => 0,
            'skipped' => 0,
        ];

        $rules = SnagEscalationRule::query()
            ->where('is_active', true)
            ->when($organizationId !== null, fn ($query) => $query->where('organization_id', $organizationId))
            ->orderBy('organization_id')
            ->orderBy('project_id')
            ->orderBy('id')
            ->get();

        foreach ($rules as $rule) {
            $stats['rules']++;

            $snags = $this->overdueSnagsForRule($rule);
            $stats['snags'] += $snags->count();

            foreach ($snags as $snag) {
                $recipients = $this->resolveRecipients($snag, collect($rule->escalate_to_roles ?? []));
                if ($recipients->isEmpty()) {
                    $stats['skipped']++;
                    continue;
                }

                $overdueDays = Carbon::parse($snag->due_date)->startOfDay()->diffInDays(now()->startOfDay());

                foreach ($recipients as $recipient) {
                    if ($this->isWithinCooldown($snag, $rule, $recipient->id)) {
                        $stats['skipped']++;
                        continue;
                    }

                    SnagEscalation::query()->create([
                        'organization_id' => $snag->organization_id,
                        'snag_id' => $snag->id,
                        'snag_escalation_rule_id' => $rule->id,
                        'escalated_to_user_id' => $recipient->id,
                        'triggered_by' => null,
                        'escalated_at' => now(),
                        'status_at_escalation' => $snag->status,
                        'reason' => sprintf('Snag overdue by %d day(s).', $overdueDays),
                        'meta' => [
                            'rule_name' => $rule->name,
                            'overdue_days' => $overdueDays,
                            'configured_threshold' => $rule->overdue_days,
                        ],
                    ]);

                    $this->snagCollaborationService->addWatchers(
                        $snag,
                        [$recipient->id],
                        SnagCollaborationService::WATCH_SOURCE_ESCALATION,
                        null,
                    );

                    $recipient->notify(new SnagEscalatedNotification($snag, $rule, $overdueDays));

                    $this->pushNotificationService->sendToUsers(
                        $snag->organization_id,
                        [$recipient],
                        'Snag Escalated',
                        sprintf('%s overdue by %d day(s).', $snag->reference, $overdueDays),
                        'esnagging://snags/'.$snag->id,
                        [
                            'type' => 'snag_escalated',
                            'snag_id' => $snag->id,
                            'snag_reference' => $snag->reference,
                            'organization_id' => $snag->organization_id,
                            'rule_id' => $rule->id,
                            'rule_name' => $rule->name,
                            'overdue_days' => $overdueDays,
                        ],
                        'immediate_escalation',
                    );

                    event(new SnagRealtimeMessage($snag->organization_id, [
                        'action' => 'escalated',
                        'snag_id' => $snag->id,
                        'reference' => $snag->reference,
                        'project_id' => $snag->project_id,
                        'recipient_id' => $recipient->id,
                        'rule_id' => $rule->id,
                    ]));

                    $stats['escalations']++;
                }
            }

            $rule->forceFill(['last_evaluated_at' => now()])->save();
        }

        return $stats;
    }

    /**
     * @return Collection<int, Snag>
     */
    private function overdueSnagsForRule(SnagEscalationRule $rule): Collection
    {
        $thresholdDate = now()->subDays(max(1, (int) $rule->overdue_days))->toDateString();

        return Snag::query()
            ->where('organization_id', $rule->organization_id)
            ->when($rule->project_id, fn ($query) => $query->where('project_id', $rule->project_id))
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $thresholdDate)
            ->whereNotIn('status', [SnagStatus::Closed->value, SnagStatus::Rejected->value])
            ->get();
    }

    /**
     * @param  Collection<int, string>  $roleNames
     * @return Collection<int, User>
     */
    private function resolveRecipients(Snag $snag, Collection $roleNames): Collection
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

    private function isWithinCooldown(Snag $snag, SnagEscalationRule $rule, int $recipientUserId): bool
    {
        $cooldownHours = max(1, (int) $rule->cooldown_hours);
        $cutoff = now()->subHours($cooldownHours);

        return SnagEscalation::query()
            ->where('snag_id', $snag->id)
            ->where('snag_escalation_rule_id', $rule->id)
            ->where('escalated_to_user_id', $recipientUserId)
            ->where('escalated_at', '>=', $cutoff)
            ->exists();
    }
}

