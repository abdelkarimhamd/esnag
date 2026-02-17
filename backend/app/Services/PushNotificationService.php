<?php

namespace App\Services;

use App\Models\MobileDeviceToken;
use App\Models\NotificationPreference;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PushNotificationService
{
    /**
     * @param  iterable<int, User>  $users
     * @param  array<string, mixed>  $data
     */
    public function sendToUsers(
        int $organizationId,
        iterable $users,
        string $title,
        string $body,
        string $deepLink,
        array $data = [],
        ?string $notificationToggle = null,
    ): void {
        $userIds = collect($users)
            ->filter()
            ->map(fn (User $user) => $user->id)
            ->unique()
            ->values();

        if ($userIds->isEmpty()) {
            return;
        }

        $preferences = NotificationPreference::query()
            ->where('organization_id', $organizationId)
            ->whereIn('user_id', $userIds)
            ->where('push_enabled', true)
            ->get();

        if ($notificationToggle) {
            $preferences = $preferences->filter(
                fn (NotificationPreference $preference) => (bool) ($preference->{$notificationToggle} ?? true)
            )->values();
        }

        $preferences = $preferences
            ->filter(fn (NotificationPreference $preference) => ! $this->isWithinQuietHours($preference))
            ->values();

        $allowedUserIds = $preferences->pluck('user_id');

        if ($allowedUserIds->isEmpty()) {
            return;
        }

        $tokens = MobileDeviceToken::query()
            ->where('organization_id', $organizationId)
            ->whereIn('user_id', $allowedUserIds)
            ->where('is_active', true)
            ->pluck('push_token')
            ->unique()
            ->values();

        if ($tokens->isEmpty()) {
            return;
        }

        $messages = $tokens->map(function (string $token) use ($title, $body, $deepLink, $data): array {
            return [
                'to' => $token,
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
                'data' => [
                    ...$data,
                    'deep_link' => $deepLink,
                ],
            ];
        });

        $chunks = $messages->chunk(50);
        foreach ($chunks as $chunk) {
            $this->sendChunk($chunk);
        }
    }

    private function isWithinQuietHours(NotificationPreference $preference): bool
    {
        if (! $preference->quiet_hours_start || ! $preference->quiet_hours_end) {
            return false;
        }

        $timezone = $preference->timezone ?: 'UTC';
        $nowMinutes = $this->parseHourMinute(CarbonImmutable::now($timezone)->format('H:i'));
        $startMinutes = $this->parseHourMinute($preference->quiet_hours_start);
        $endMinutes = $this->parseHourMinute($preference->quiet_hours_end);

        if ($nowMinutes === null || $startMinutes === null || $endMinutes === null) {
            return false;
        }

        if ($startMinutes === $endMinutes) {
            return false;
        }

        if ($startMinutes < $endMinutes) {
            return $nowMinutes >= $startMinutes && $nowMinutes < $endMinutes;
        }

        return $nowMinutes >= $startMinutes || $nowMinutes < $endMinutes;
    }

    private function parseHourMinute(string $value): ?int
    {
        $trimmed = trim($value);
        if (! preg_match('/^(\d{1,2}):(\d{2})$/', $trimmed, $matches)) {
            return null;
        }

        $hour = (int) $matches[1];
        $minute = (int) $matches[2];

        if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
            return null;
        }

        return ($hour * 60) + $minute;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $chunk
     */
    private function sendChunk(Collection $chunk): void
    {
        if ($chunk->isEmpty()) {
            return;
        }

        try {
            Http::timeout(8)
                ->acceptJson()
                ->post('https://exp.host/--/api/v2/push/send', $chunk->values()->all());
        } catch (\Throwable $exception) {
            Log::warning('Push delivery failed', [
                'error' => $exception->getMessage(),
                'batch_size' => $chunk->count(),
            ]);
        }
    }
}
