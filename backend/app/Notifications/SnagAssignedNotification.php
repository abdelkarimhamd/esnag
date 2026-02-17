<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagAssignedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly User $assignedBy,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_assignment');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Snag Assigned: '.$this->snag->reference)
            ->line('You were assigned a snag in project '.$this->snag->project->name.'.')
            ->line($this->snag->title)
            ->line('Assigned by: '.$this->assignedBy->name);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_assigned',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'snag_title' => $this->snag->title,
            'assigned_by' => [
                'id' => $this->assignedBy->id,
                'name' => $this->assignedBy->name,
            ],
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}

