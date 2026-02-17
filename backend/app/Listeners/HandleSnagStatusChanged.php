<?php

namespace App\Listeners;

use App\Enums\SnagStatus;
use App\Events\DashboardRealtimeMessage;
use App\Events\SnagRealtimeMessage;
use App\Events\SnagStatusChanged;
use App\Notifications\SnagAssignedNotification;
use App\Notifications\SnagStatusChangedNotification;
use App\Services\PushNotificationService;
use App\Services\SnagCollaborationService;

class HandleSnagStatusChanged
{
    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
        private readonly SnagCollaborationService $snagCollaborationService,
    ) {
    }

    public function handle(SnagStatusChanged $event): void
    {
        $snag = $event->snag->loadMissing(['creator', 'assignee', 'watcherUsers']);

        if (
            $event->toStatus === SnagStatus::Assigned->value
            && $snag->assignee
            && $snag->assignee->id !== $event->actor->id
        ) {
            $snag->assignee->notify(new SnagAssignedNotification($snag, $event->actor));

            $this->pushNotificationService->sendToUsers(
                $snag->organization_id,
                [$snag->assignee],
                'Snag Assigned',
                $snag->reference.' was assigned to you.',
                'esnagging://snags/'.$snag->id,
                [
                    'type' => 'snag_assigned',
                    'snag_id' => $snag->id,
                    'snag_reference' => $snag->reference,
                    'organization_id' => $snag->organization_id,
                ],
                'immediate_assignment',
            );
        }

        $recipients = $this->snagCollaborationService
            ->notificationRecipientsForStatus($snag, $event->actor->id)
            ->reject(
                fn ($user) => $event->toStatus === SnagStatus::Assigned->value
                    && $snag->assignee
                    && $user->id === $snag->assignee->id
            )
            ->values();

        $recipients->each(fn ($user) => $user->notify(
            new SnagStatusChangedNotification($snag, $event->fromStatus, $event->toStatus, $event->actor)
        ));

        $this->pushNotificationService->sendToUsers(
            $snag->organization_id,
            $recipients,
            'Snag Status Updated',
            sprintf('%s moved %s -> %s', $snag->reference, $event->fromStatus, $event->toStatus),
            'esnagging://snags/'.$snag->id,
            [
                'type' => 'snag_status_changed',
                'snag_id' => $snag->id,
                'snag_reference' => $snag->reference,
                'from_status' => $event->fromStatus,
                'to_status' => $event->toStatus,
                'organization_id' => $snag->organization_id,
            ],
            'immediate_status_change',
        );

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'status_changed',
            'snag_id' => $snag->id,
            'reference' => $snag->reference,
            'from_status' => $event->fromStatus,
            'to_status' => $event->toStatus,
            'project_id' => $snag->project_id,
        ]));

        event(new DashboardRealtimeMessage($snag->organization_id, [
            'action' => 'snag_status_changed',
            'snag_id' => $snag->id,
            'project_id' => $snag->project_id,
            'to_status' => $event->toStatus,
        ]));
    }
}
