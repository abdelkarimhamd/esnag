<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagStatusChangedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly string $fromStatus,
        private readonly string $toStatus,
        private readonly User $changedBy,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_status_change');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Snag Status Updated: '.$this->snag->reference)
            ->line('Snag status changed from '.$this->fromStatus.' to '.$this->toStatus.'.')
            ->line('Updated by: '.$this->changedBy->name)
            ->line($this->snag->title);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_status_changed',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'snag_title' => $this->snag->title,
            'from_status' => $this->fromStatus,
            'to_status' => $this->toStatus,
            'changed_by' => [
                'id' => $this->changedBy->id,
                'name' => $this->changedBy->name,
            ],
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}

