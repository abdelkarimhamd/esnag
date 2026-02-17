<?php

namespace App\Services;

use App\Models\MobileAuthDevice;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;

class MobileDeviceSecurityService
{
    public function trustedDevice(User $user, ?string $deviceId): ?MobileAuthDevice
    {
        if (! $deviceId || trim($deviceId) === '') {
            return null;
        }

        return MobileAuthDevice::query()
            ->where('user_id', $user->id)
            ->where('device_id', trim($deviceId))
            ->where('is_active', true)
            ->where(function ($query): void {
                $query->whereNull('trusted_until')
                    ->orWhere('trusted_until', '>=', Carbon::now());
            })
            ->first();
    }

    public function registerLoginDevice(
        User $user,
        string $deviceId,
        ?string $deviceName,
        ?string $platform,
        ?string $appVersion,
        bool $trustDevice,
        int $trustDays,
        int $tokenId,
        Request $request,
    ): MobileAuthDevice {
        $device = MobileAuthDevice::query()->firstOrNew([
            'user_id' => $user->id,
            'device_id' => trim($deviceId),
        ]);

        $previousTokenId = $device->last_token_id;
        if ($previousTokenId && $previousTokenId !== $tokenId) {
            PersonalAccessToken::query()->where('id', $previousTokenId)->delete();
        }

        $currentTrustedUntil = $device->trusted_until;
        $nextTrustedUntil = $trustDevice
            ? Carbon::now()->addDays(max(1, $trustDays))
            : ($currentTrustedUntil && $currentTrustedUntil->isFuture() ? $currentTrustedUntil : null);

        $device->fill([
            'device_name' => $deviceName ?: $device->device_name,
            'platform' => $platform ?: ($device->platform ?: 'mobile'),
            'app_version' => $appVersion ?: $device->app_version,
            'is_active' => true,
            'trusted_until' => $nextTrustedUntil,
            'last_token_id' => $tokenId,
            'last_ip' => $request->ip(),
            'last_user_agent' => substr((string) $request->userAgent(), 0, 65535),
            'last_seen_at' => Carbon::now(),
            'meta' => is_array($device->meta) ? $device->meta : null,
        ]);
        $device->save();

        return $device;
    }

    public function revokeDevice(User $user, MobileAuthDevice $device): MobileAuthDevice
    {
        if ($device->user_id !== $user->id) {
            abort(404);
        }

        if ($device->last_token_id) {
            PersonalAccessToken::query()->where('id', $device->last_token_id)->delete();
        }

        $device->fill([
            'is_active' => false,
            'trusted_until' => null,
            'last_token_id' => null,
            'last_seen_at' => Carbon::now(),
        ])->save();

        return $device;
    }
}

