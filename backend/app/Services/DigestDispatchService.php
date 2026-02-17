<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Models\InspectionApproval;
use App\Models\NotificationPreference;
use App\Models\Organization;
use App\Models\Snag;
use App\Models\User;
use App\Notifications\DigestSummaryNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class DigestDispatchService
{
    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
    ) {
    }

    /**
     * @return array{processed: int, sent: int, skipped: int}
     */
    public function dispatch(string $frequency): array
    {
        $frequency = strtolower($frequency);
        if (! in_array($frequency, ['daily', 'weekly', 'monthly'], true)) {
            throw new \InvalidArgumentException('Unsupported digest frequency: '.$frequency);
        }

        $processed = 0;
        $sent = 0;
        $skipped = 0;

        Organization::query()
            ->with(['users' => function ($query): void {
                $query->where('organization_user.is_active', true);
            }])
            ->chunkById(50, function (Collection $organizations) use ($frequency, &$processed, &$sent, &$skipped): void {
                foreach ($organizations as $organization) {
                    /** @var Organization $organization */
                    foreach ($organization->users as $user) {
                        /** @var User $user */
                        $processed++;

                        $preference = NotificationPreference::query()->firstOrCreate(
                            [
                                'organization_id' => $organization->id,
                                'user_id' => $user->id,
                            ],
                            [
                                'digest_frequency' => 'daily',
                                'email_enabled' => true,
                                'in_app_enabled' => true,
                                'push_enabled' => false,
                                'timezone' => 'UTC',
                            ]
                        );

                        if ($preference->digest_frequency !== $frequency) {
                            $skipped++;

                            continue;
                        }

                        if (! $this->canSendNow($preference, $frequency)) {
                            $skipped++;

                            continue;
                        }

                        $summary = $this->buildSummary($organization->id, $user);
                        $user->notify(new DigestSummaryNotification($organization, $frequency, $summary));

                        if ($preference->push_enabled) {
                            $this->pushNotificationService->sendToUsers(
                                $organization->id,
                                [$user],
                                ucfirst($frequency).' Digest',
                                sprintf(
                                    'Open: %d | Overdue: %d | Assigned: %d | Approvals: %d',
                                    $summary['open_snags'],
                                    $summary['overdue_snags'],
                                    $summary['assigned_to_me'],
                                    $summary['approval_needed'],
                                ),
                                'esnagging://dashboard',
                                [
                                    'type' => 'digest_summary',
                                    'frequency' => $frequency,
                                    'organization_id' => $organization->id,
                                ],
                            );
                        }

                        $this->markSent($preference, $frequency);
                        $sent++;
                    }
                }
            });

        return [
            'processed' => $processed,
            'sent' => $sent,
            'skipped' => $skipped,
        ];
    }

    private function canSendNow(NotificationPreference $preference, string $frequency): bool
    {
        $timezone = $preference->timezone ?: 'UTC';
        $now = CarbonImmutable::now($timezone);

        return match ($frequency) {
            'daily' => ! $preference->last_daily_sent_at || ! $preference->last_daily_sent_at->isSameDay($now),
            'weekly' => ! $preference->last_weekly_sent_at || $preference->last_weekly_sent_at->copy()->timezone($timezone)->isoWeek() !== $now->isoWeek() || $preference->last_weekly_sent_at->copy()->timezone($timezone)->year !== $now->year,
            'monthly' => ! $preference->last_monthly_sent_at || $preference->last_monthly_sent_at->copy()->timezone($timezone)->month !== $now->month || $preference->last_monthly_sent_at->copy()->timezone($timezone)->year !== $now->year,
            default => false,
        };
    }

    /**
     * @return array{open_snags: int, overdue_snags: int, assigned_to_me: int, approval_needed: int}
     */
    private function buildSummary(int $organizationId, User $user): array
    {
        $openStatuses = [SnagStatus::Closed->value, SnagStatus::Rejected->value];

        $openSnags = Snag::query()
            ->where('organization_id', $organizationId)
            ->whereNotIn('status', $openStatuses)
            ->count();

        $overdueSnags = Snag::query()
            ->where('organization_id', $organizationId)
            ->whereNotIn('status', $openStatuses)
            ->whereDate('due_date', '<', Carbon::today())
            ->count();

        $assignedToMe = Snag::query()
            ->where('organization_id', $organizationId)
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', $openStatuses)
            ->count();

        $roleNames = $user->roleNamesForOrganization($organizationId);

        $approvalNeeded = 0;
        if ($roleNames !== []) {
            $approvalNeeded = InspectionApproval::query()
                ->where('organization_id', $organizationId)
                ->where('status', 'pending')
                ->whereIn('role_name', $roleNames)
                ->count();
        }

        return [
            'open_snags' => $openSnags,
            'overdue_snags' => $overdueSnags,
            'assigned_to_me' => $assignedToMe,
            'approval_needed' => $approvalNeeded,
        ];
    }

    private function markSent(NotificationPreference $preference, string $frequency): void
    {
        $now = Carbon::now();

        if ($frequency === 'daily') {
            $preference->last_daily_sent_at = $now;
        }

        if ($frequency === 'weekly') {
            $preference->last_weekly_sent_at = $now;
        }

        if ($frequency === 'monthly') {
            $preference->last_monthly_sent_at = $now;
        }

        $preference->save();
    }
}
