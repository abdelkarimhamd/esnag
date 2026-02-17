<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;

class MfaService
{
    public function __construct(
        private readonly TotpService $totpService,
        private readonly OrganizationSecurityService $organizationSecurityService,
    ) {
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

