<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\SnagComment;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagCommentAddedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly SnagComment $comment,
        private readonly User $commentedBy,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_comment');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('New Snag Comment: '.$this->snag->reference)
            ->line($this->commentedBy->name.' added a comment.')
            ->line($this->comment->body);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_comment_added',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'comment_id' => $this->comment->id,
            'commented_by' => [
                'id' => $this->commentedBy->id,
                'name' => $this->commentedBy->name,
            ],
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}

