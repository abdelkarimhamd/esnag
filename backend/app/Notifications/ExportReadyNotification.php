<?php

namespace App\Notifications;

use App\Models\ExportJob;
use App\Notifications\Concerns\ResolvesNotificationChannels;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ExportReadyNotification extends Notification
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
            ->subject('Export Ready: '.$this->exportJob->type)
            ->line('Your requested export is ready for download.')
            ->line('Format: '.strtoupper($this->exportJob->type))
            ->line('Generated: '.optional($this->exportJob->completed_at)->toDateTimeString())
            ->action('Download Export', $this->exportJob->download_url ?? url('/'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'export_ready',
            'export_job_id' => $this->exportJob->id,
            'export_type' => $this->exportJob->type,
            'project_id' => $this->exportJob->project_id,
            'organization_id' => $this->exportJob->organization_id,
            'status' => $this->exportJob->status,
            'download_url' => $this->exportJob->download_url,
            'file_name' => $this->exportJob->file_name,
            'deep_link' => 'esnagging://exports/'.$this->exportJob->id,
        ];
    }
}
