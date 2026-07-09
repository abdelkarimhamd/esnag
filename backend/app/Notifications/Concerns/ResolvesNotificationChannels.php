<?php

namespace App\Notifications\Concerns;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;

trait ResolvesNotificationChannels
{
    /**
     * @return array<int, string>
     */
    protected function preferredChannels(
        object $notifiable,
        int $organizationId,
        ?string $notificationToggle = null,
    ): array {
        if (! $notifiable instanceof User) {
            return ['database', 'mail'];
        }

        $preference = NotificationPreference::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $notifiable->id)
            ->first();

        if ($notificationToggle && $preference && ! (bool) $preference->{$notificationToggle}) {
            return [];
        }

        $channels = [];
        if ($preference?->in_app_enabled ?? true) {
            $channels[] = 'database';
        }

        if ($preference?->email_enabled ?? true) {
            $channels[] = 'mail';
        }

        // SMS is opt-in per user (default off), requires a phone number, and is
        // only attempted when a gateway is configured (OD-14). Email above remains
        // the guaranteed fallback. Only notifications with toSms() actually send.
        if (($preference?->sms_enabled ?? false)
            && ! empty($notifiable->phone)
            && (bool) config('sms.enabled', false)) {
            $channels[] = SmsChannel::class;
        }

        return $channels;
    }
}
