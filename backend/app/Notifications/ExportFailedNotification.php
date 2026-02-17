<?php

namespace App\Notifications;

use App\Models\ExportJob;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ExportFailedNotification extends Notification
{
    use Queueable;
    use ResolvesNotificationChannels;

    public function __construct(
        private readonly ExportJob $exportJob,
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->preferredChannels($notifiable, $this->exportJob->organization_id);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Export Failed: '.$this->exportJob->type)
            ->line('Your export request could not be completed.')
            ->line($this->exportJob->error_message ?: 'Please retry from the export center.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'export_failed',
            'export_job_id' => $this->exportJob->id,
            'export_type' => $this->exportJob->type,
            'project_id' => $this->exportJob->project_id,
            'organization_id' => $this->exportJob->organization_id,
            'status' => $this->exportJob->status,
            'error_message' => $this->exportJob->error_message,
            'deep_link' => 'esnagging://exports/'.$this->exportJob->id,
        ];
    }
}
