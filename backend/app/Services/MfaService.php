<?php

namespace App\Services;

use App\Models\OtpChallenge;
use App\Models\User;
use App\Notifications\OtpCodeNotification;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class MfaService
{
    /** Minutes a one-time passcode remains valid. */
    private const OTP_TTL_MINUTES = 10;

    /** Max verification attempts against a single challenge before it is burned. */
    private const OTP_MAX_ATTEMPTS = 6;

    public function __construct(
        private readonly TotpService $totpService,
        private readonly OrganizationSecurityService $organizationSecurityService,
        private readonly SmsGatewayService $smsGatewayService,
    ) {
    }

    /**
     * Issue a one-time passcode over the given channel (item 15). Email is the
     * active channel; SMS is only used when explicitly requested AND the gateway
     * is configured (OD-14), otherwise it falls back to email. Any prior
     * unconsumed challenge for the user is invalidated first.
     */
    public function issueOtp(User $user, string $channel = 'email'): OtpChallenge
    {
        OtpChallenge::query()
            ->where('user_id', $user->id)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $useSms = $channel === 'sms' && ! empty($user->phone) && $this->smsGatewayService->isEnabled();
        $resolvedChannel = $useSms ? 'sms' : 'email';

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $challenge = OtpChallenge::query()->create([
            'user_id' => $user->id,
            'channel' => $resolvedChannel,
            'code_hash' => Hash::make($code),
            'destination' => $this->maskDestination($user, $resolvedChannel),
            'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
        ]);

        $user->notify(new OtpCodeNotification($code, $resolvedChannel));

        return $challenge;
    }

    /**
     * Verify a submitted one-time passcode against the user's latest live
     * challenge, consuming it on success (or burning it on too many attempts).
     */
    public function verifyOtp(User $user, string $code): bool
    {
        // Row-locked in a transaction so the attempt cap is enforced atomically —
        // concurrent verify requests serialize instead of all reading attempts=0
        // and slipping past the check (TOCTOU).
        return DB::transaction(function () use ($user, $code): bool {
            $challenge = OtpChallenge::query()
                ->where('user_id', $user->id)
                ->whereNull('consumed_at')
                ->where('expires_at', '>', now())
                ->latest('id')
                ->lockForUpdate()
                ->first();

            if (! $challenge) {
                return false;
            }

            if ($challenge->attempts >= self::OTP_MAX_ATTEMPTS) {
                $challenge->forceFill(['consumed_at' => now()])->save();

                return false;
            }

            $challenge->forceFill(['attempts' => $challenge->attempts + 1])->save();

            if (! Hash::check($code, $challenge->code_hash)) {
                return false;
            }

            $challenge->forceFill(['consumed_at' => now()])->save();

            return true;
        });
    }

    private function maskDestination(User $user, string $channel): ?string
    {
        if ($channel === 'sms' && ! empty($user->phone)) {
            $phone = (string) $user->phone;

            return str_repeat('•', max(0, strlen($phone) - 4)).substr($phone, -4);
        }

        $email = (string) $user->email;
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $maskedLocal = strlen($local) <= 2 ? $local : substr($local, 0, 2).str_repeat('•', max(1, strlen($local) - 2));

        return $domain === '' ? $maskedLocal : $maskedLocal.'@'.$domain;
    }

    public function requiresWebMfa(User $user): bool
    {
        return (bool) $user->mfa_enabled || $this->organizationSecurityService->requiresWebMfaForUser($user);
    }

    public function requiresMobileMfa(User $user): bool
    {
        return (bool) $user->mfa_enabled || $this->organizationSecurityService->requiresMobileMfaForUser($user);
    }

    public function verifyCodeForUser(User $user, string $otpCode): bool
    {
        $secret = $this->resolveSecret($user);
        if (! $secret) {
            return false;
        }

        return $this->totpService->verify($secret, $otpCode);
    }

    public function generateEnrollmentSecret(User $user): array
    {
        $secret = $this->totpService->generateSecret();
        $uri = $this->totpService->provisioningUri(
            (string) config('security.mfa_issuer', config('app.name', 'eSnagging')),
            $user->email,
            $secret,
        );

        return [
            'secret' => $secret,
            'otpauth_uri' => $uri,
            'issuer' => (string) config('security.mfa_issuer', config('app.name', 'eSnagging')),
        ];
    }

    public function enableForUser(User $user, string $secret, string $otpCode): User
    {
        if (! $this->totpService->verify($secret, $otpCode)) {
            throw ValidationException::withMessages([
                'otp_code' => ['Invalid TOTP code for the provided secret.'],
            ]);
        }

        $user->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => Crypt::encryptString($secret),
            'mfa_recovery_codes' => null,
        ])->save();

        return $user;
    }

    public function disableForUser(User $user, string $otpCode): User
    {
        if (! $this->verifyCodeForUser($user, $otpCode)) {
            throw ValidationException::withMessages([
                'otp_code' => ['Invalid TOTP code.'],
            ]);
        }

        $user->forceFill([
            'mfa_enabled' => false,
            'mfa_secret' => null,
            'mfa_recovery_codes' => null,
        ])->save();

        return $user;
    }

    private function resolveSecret(User $user): ?string
    {
        if (! $user->mfa_secret || ! is_string($user->mfa_secret)) {
            return null;
        }

        try {
            return Crypt::decryptString($user->mfa_secret);
        } catch (\Throwable) {
            return $user->mfa_secret;
        }
    }
}

