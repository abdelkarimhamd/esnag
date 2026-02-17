<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Models\Snag;
use App\Models\SnagReminderLog;
use App\Models\SnagReminderPolicy;
use App\Notifications\SnagReminderNotification;
use Illuminate\Support\Collection;

class SnagReminderService
{
    /**
     * @return array{policies:int,candidates:int,sent:int,skipped:int}
     */
    public function sendDueReminders(?int $organizationId = null): array
    {
        $stats = [
            'policies' => 0,
            'candidates' => 0,
            'sent' => 0,
            'skipped' => 0,
        ];

        $policies = SnagReminderPolicy::query()
            ->where('is_active', true)
            ->when($organizationId !== null, fn ($query) => $query->where('organization_id', $organizationId))
            ->orderBy('organization_id')
            ->orderBy('project_id')
            ->orderBy('id')
            ->get();

        foreach ($policies as $policy) {
            $stats['policies']++;

            $snags = $this->candidateSnagsForPolicy($policy);
            $stats['candidates'] += $snags->count();

            foreach ($snags as $snag) {
                $assignee = $snag->assignee;
                if (! $assignee) {
                    $stats['skipped']++;
                    continue;
                }

                $lastLog = SnagReminderLog::query()
                    ->where('snag_id', $snag->id)
                    ->where('snag_reminder_policy_id', $policy->id)
                    ->where('user_id', $assignee->id)
                    ->orderByDesc('reminded_at')
                    ->first();

                $nextCount = ((int) ($lastLog?->reminder_count ?? 0)) + 1;

                if ($nextCount > max(1, (int) $policy->max_reminders)) {
                    $stats['skipped']++;
                    continue;
                }

                if ($lastLog && $lastLog->reminded_at?->gt(now()->subHours(max(1, (int) $policy->reminder_every_hours)))) {
                    $stats['skipped']++;
                    continue;
                }

                $assignee->notify(new SnagReminderNotification(
                    $snag,
                    $nextCount,
                    (int) $policy->max_reminders,
                    (int) $policy->reminder_every_hours,
                ));

                $this->pushNotificationService->sendToUsers(
                    $snag->organization_id,
                    [$assignee],
                    'Snag Reminder',
                    sprintf('%s is waiting for your action.', $snag->reference),
                    'esnagging://snags/'.$snag->id,
                    [
                        'type' => 'snag_reminder',
                        'snag_id' => $snag->id,
                        'snag_reference' => $snag->reference,
                        'organization_id' => $snag->organization_id,
                        'policy_id' => $policy->id,
                        'reminder_count' => $nextCount,
                    ],
                    'immediate_assignment',
                );

                SnagReminderLog::query()->create([
                    'organization_id' => $snag->organization_id,
                    'snag_id' => $snag->id,
                    'snag_reminder_policy_id' => $policy->id,
                    'user_id' => $assignee->id,
                    'reminder_count' => $nextCount,
                    'reminded_at' => now(),
                    'next_due_at' => now()->addHours(max(1, (int) $policy->reminder_every_hours)),
                ]);

                $stats['sent']++;
            }
        }

        return $stats;
    }

    /**
     * @return Collection<int, Snag>
     */
    private function candidateSnagsForPolicy(SnagReminderPolicy $policy): Collection
    {
        $statuses = collect($policy->statuses ?: [
            SnagStatus::Assigned->value,
            SnagStatus::InProgress->value,
            SnagStatus::ReadyForReview->value,
        ])
            ->map(fn ($status) => strtolower(trim((string) $status)))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return Snag::query()
            ->where('organization_id', $policy->organization_id)
            ->when($policy->project_id, fn ($query) => $query->where('project_id', $policy->project_id))
            ->whereNotNull('assigned_to')
            ->whereIn('status', $statuses)
            ->with(['assignee:id,name,email', 'project:id,name,code'])
            ->get();
    }

    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
    ) {
    }
}
