<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagReminderNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly int $reminderCount,
        private readonly int $maxReminders,
        private readonly int $intervalHours,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_assignment');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Reminder: Snag Action Required '.$this->snag->reference)
            ->line('This snag is still awaiting action.')
            ->line($this->snag->title)
            ->line(sprintf(
                'Reminder %d of %d. Next reminder in %d hour(s) if no action is taken.',
                $this->reminderCount,
                $this->maxReminders,
                $this->intervalHours,
            ));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_reminder',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'snag_title' => $this->snag->title,
            'status' => $this->snag->status,
            'reminder_count' => $this->reminderCount,
            'max_reminders' => $this->maxReminders,
            'interval_hours' => $this->intervalHours,
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}
