<?php

namespace App\Notifications;

use App\Models\Organization;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class DigestSummaryNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    /**
     * @param  array<string, int>  $summary
     */
    public function __construct(
        private readonly Organization $organization,
        private readonly string $frequency,
        private readonly array $summary,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->organization->id);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $label = ucfirst($this->frequency);

        return (new MailMessage)
            ->subject($label.' Digest - '.$this->organization->name)
            ->line($label.' summary for '.$this->organization->name)
            ->line('Open snags: '.$this->summary['open_snags'])
            ->line('Overdue snags: '.$this->summary['overdue_snags'])
            ->line('Assigned to you: '.$this->summary['assigned_to_me'])
            ->line('Approvals needed: '.$this->summary['approval_needed'])
            ->line('Review key items in eSnagging.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'digest_summary',
            'organization_id' => $this->organization->id,
            'frequency' => $this->frequency,
            'summary' => $this->summary,
            'deep_link' => 'esnagging://dashboard',
        ];
    }
}
