<?php

namespace App\Notifications;

use App\Models\InspectionApproval;
use App\Models\InspectionSubmission;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InspectionApprovalRequiredNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly InspectionSubmission $submission,
        private readonly InspectionApproval $approval,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->submission->organization_id, 'approval_needed');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Inspection Approval Required: '.$this->submission->reference)
            ->line('An inspection submission is awaiting your review.')
            ->line('Reference: '.$this->submission->reference)
            ->line('Step: '.($this->approval->step_name ?: 'Step '.$this->approval->step_order))
            ->line('Role: '.$this->approval->role_name);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'inspection_approval_required',
            'organization_id' => $this->submission->organization_id,
            'inspection_submission_id' => $this->submission->id,
            'inspection_reference' => $this->submission->reference,
            'inspection_status' => $this->submission->status,
            'approval_id' => $this->approval->id,
            'step_order' => $this->approval->step_order,
            'step_name' => $this->approval->step_name,
            'role_name' => $this->approval->role_name,
            'requires_signature' => $this->approval->requires_signature,
            'deep_link' => 'esnagging://inspections/submissions/'.$this->submission->id,
        ];
    }
}
