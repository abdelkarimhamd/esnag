<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Delivers a one-time passcode (item 15). Email is the active channel (OD-14: the
 * SMS gateway is deferred); toSms() is ready for when SMS is confirmed. OTP codes
 * are delivered to a fixed channel, not the user's general notification prefs.
 */
class OtpCodeNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $code,
        private readonly string $channel = 'email',
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->channel === 'sms'
            ? [\App\Notifications\Channels\SmsChannel::class]
            : ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your eSnag verification code')
            ->line('Use this one-time verification code to finish signing in:')
            ->line($this->code)
            ->line('The code expires in 10 minutes. If you did not try to sign in, you can ignore this email.');
    }

    public function toSms(object $notifiable): string
    {
        return 'eSnag verification code: '.$this->code.' (expires in 10 minutes).';
    }
}
