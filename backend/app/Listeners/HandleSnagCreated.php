<?php

namespace App\Listeners;

use App\Events\DashboardRealtimeMessage;
use App\Events\SnagCreated;
use App\Events\SnagRealtimeMessage;
use App\Notifications\SnagAssignedNotification;
use App\Services\PushNotificationService;
use App\Services\SnagCollaborationService;

class HandleSnagCreated
{
    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
        private readonly SnagCollaborationService $snagCollaborationService,
    ) {
    }

    public function handle(SnagCreated $event): void
    {
        $snag = $event->snag->loadMissing(['project', 'creator', 'assignee']);
        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $event->actor->id);

        if ($snag->assignee && $snag->assignee->id !== $event->actor->id) {
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

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'created',
            'snag_id' => $snag->id,
            'reference' => $snag->reference,
            'status' => $snag->status,
            'project_id' => $snag->project_id,
        ]));

        event(new DashboardRealtimeMessage($snag->organization_id, [
            'action' => 'snag_created',
            'snag_id' => $snag->id,
            'project_id' => $snag->project_id,
        ]));
    }
}
