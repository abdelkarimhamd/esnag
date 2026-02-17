<?php

namespace App\Notifications;

use App\Models\InspectionApproval;
use App\Models\InspectionSubmission;
use App\Models\User;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InspectionDecisionNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly InspectionSubmission $submission,
        private readonly InspectionApproval $approval,
        private readonly User $actedBy,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->submission->organization_id, 'approval_needed');
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Inspection Decision: '.$this->submission->reference)
            ->line('A decision was recorded on an inspection approval step.')
            ->line('Reference: '.$this->submission->reference)
            ->line('Decision: '.$this->approval->status)
            ->line('By: '.$this->actedBy->name);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'inspection_decision',
            'organization_id' => $this->submission->organization_id,
            'inspection_submission_id' => $this->submission->id,
            'inspection_reference' => $this->submission->reference,
            'inspection_status' => $this->submission->status,
            'approval_id' => $this->approval->id,
            'approval_status' => $this->approval->status,
            'acted_by' => [
                'id' => $this->actedBy->id,
                'name' => $this->actedBy->name,
            ],
            'notes' => $this->approval->decision_notes,
            'deep_link' => 'esnagging://inspections/submissions/'.$this->submission->id,
        ];
    }
}
