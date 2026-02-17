<?php

namespace App\Notifications\Concerns;

use App\Models\NotificationPreference;
use App\Models\User;

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

        return $channels;
    }
}
