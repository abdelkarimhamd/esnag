<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\SnagEscalationRule;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagEscalatedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly SnagEscalationRule $rule,
        private readonly int $overdueDays,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_escalation');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Snag escalated: '.$this->snag->reference)
            ->line($this->snag->reference.' has exceeded the overdue threshold.')
            ->line('Rule: '.$this->rule->name)
            ->line('Overdue by '.$this->overdueDays.' day(s).');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_escalated',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'snag_title' => $this->snag->title,
            'status' => $this->snag->status,
            'rule_id' => $this->rule->id,
            'rule_name' => $this->rule->name,
            'overdue_days' => $this->overdueDays,
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}

