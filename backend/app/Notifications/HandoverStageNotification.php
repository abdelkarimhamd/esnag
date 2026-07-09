<?php

namespace App\Notifications;

use App\Models\HandoverRequest;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Alerts a party when a handover request needs its attention (§11.2): submitted,
 * forwarded, returned/rejected, revised, approved, resubmitted, assigned or closed.
 */
class HandoverStageNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly HandoverRequest $request,
        private readonly string $event,
        private readonly ?User $actor = null,
        private readonly ?string $reason = null,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->request->organization_id);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject($this->subjectLine())
            ->line($this->bodyLine());

        if ($this->reason) {
            $mail->line('Reason: '.$this->reason);
        }

        return $mail->line('Reference: '.$this->request->reference);
    }

    public function toSms(object $notifiable): string
    {
        $text = $this->subjectLine();

        return $this->reason ? $text.' — '.$this->reason : $text;
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'handover_stage',
            'event' => $this->event,
            'handover_request_id' => $this->request->id,
            'reference' => $this->request->reference,
            'title' => $this->request->title,
            'stage_order' => $this->request->current_stage_order,
            'status' => $this->request->status,
            'reason' => $this->reason,
            'actor' => $this->actor ? ['id' => $this->actor->id, 'name' => $this->actor->name] : null,
            'project_id' => $this->request->project_id,
            'organization_id' => $this->request->organization_id,
            'deep_link' => 'esnagging://handovers/'.$this->request->id,
        ];
    }

    private function subjectLine(): string
    {
        return match ($this->event) {
            'submitted' => 'Handover submitted for review: '.$this->request->reference,
            'forwarded' => 'Handover forwarded to you: '.$this->request->reference,
            'returned', 'rejected' => 'Handover returned: '.$this->request->reference,
            'revised' => 'Handover revision requested: '.$this->request->reference,
            'approved' => 'Handover approved: '.$this->request->reference,
            'assigned' => 'Handover assigned to you: '.$this->request->reference,
            'closed' => 'Handover closed: '.$this->request->reference,
            'cancelled' => 'Handover cancelled: '.$this->request->reference,
            'commented' => 'New comment on handover: '.$this->request->reference,
            'escalated' => 'Handover overdue — action needed: '.$this->request->reference,
            default => 'Handover update: '.$this->request->reference,
        };
    }

    private function bodyLine(): string
    {
        return match ($this->event) {
            'submitted' => 'A handover request has been submitted and now awaits your review.',
            'forwarded' => 'A handover request has been forwarded to your party for action.',
            'returned', 'rejected' => 'A handover request has been returned to your party.',
            'revised' => 'A revision has been requested on a handover assigned to your party.',
            'approved' => 'A handover request has been approved.',
            'assigned' => 'You have been assigned a handover request.',
            'closed' => 'A handover request has been closed.',
            'cancelled' => 'A handover request has been cancelled.',
            'commented' => 'A new comment has been posted on a handover request.',
            'escalated' => 'A handover stage has passed its due date and needs your attention.',
            default => 'A handover request has been updated.',
        };
    }
}
