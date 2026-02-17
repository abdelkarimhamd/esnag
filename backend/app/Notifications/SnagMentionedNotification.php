<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\SnagComment;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagMentionedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly SnagComment $comment,
        private readonly User $mentionedBy,
        private readonly ?string $mentionContext = null,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_mention');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('You were mentioned on snag '.$this->snag->reference)
            ->line($this->mentionedBy->name.' mentioned you in a snag comment.')
            ->line($this->comment->body);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_mentioned',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'comment_id' => $this->comment->id,
            'comment_body' => $this->comment->body,
            'mentioned_by' => [
                'id' => $this->mentionedBy->id,
                'name' => $this->mentionedBy->name,
            ],
            'mention_context' => $this->mentionContext,
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}

