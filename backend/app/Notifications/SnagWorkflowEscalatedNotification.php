<?php

namespace App\Notifications;

use App\Models\Snag;
use App\Models\WorkflowAutomationRule;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SnagWorkflowEscalatedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly Snag $snag,
        private readonly WorkflowAutomationRule $rule,
        private readonly ?string $reason = null,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->snag->organization_id, 'immediate_escalation');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Workflow Escalation: '.$this->snag->reference)
            ->line('A workflow automation rule escalated this snag.')
            ->line('Rule: '.$this->rule->name)
            ->line($this->reason ?: 'Please review and take action.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'snag_workflow_escalated',
            'snag_id' => $this->snag->id,
            'snag_reference' => $this->snag->reference,
            'snag_title' => $this->snag->title,
            'status' => $this->snag->status,
            'rule_id' => $this->rule->id,
            'rule_name' => $this->rule->name,
            'reason' => $this->reason,
            'project_id' => $this->snag->project_id,
            'organization_id' => $this->snag->organization_id,
            'deep_link' => 'esnagging://snags/'.$this->snag->id,
        ];
    }
}
