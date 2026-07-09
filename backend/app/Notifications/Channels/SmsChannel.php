<?php

namespace App\Notifications\Channels;

use App\Services\SmsGatewayService;
use Illuminate\Notifications\Notification;

/**
 * Custom SMS notification channel (item 11 / §11.2). Referenced by class-name in
 * a notification's via() list. Silently no-ops for notifications that do not
 * implement toSms() or for notifiables without a phone, so it is safe to add to
 * the shared channel resolver.
 */
class SmsChannel
{
    public function __construct(private readonly SmsGatewayService $gateway)
    {
    }

    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toSms')) {
            return;
        }

        $to = null;
        if (method_exists($notifiable, 'routeNotificationFor')) {
            $to = $notifiable->routeNotificationFor('sms', $notification);
        }
        $to = $to ?: ($notifiable->phone ?? null);

        if (! $to) {
            return;
        }

        $this->gateway->send((string) $to, (string) $notification->toSms($notifiable));
    }
}
