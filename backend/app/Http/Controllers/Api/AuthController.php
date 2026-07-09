<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AccessControlService;
use App\Services\FeatureFlagService;
use App\Services\MfaService;
use App\Services\MobileDeviceSecurityService;
use App\Services\OrganizationSecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly FeatureFlagService $featureFlagService,
        private readonly MfaService $mfaService,
        private readonly OrganizationSecurityService $organizationSecurityService,
        private readonly MobileDeviceSecurityService $mobileDeviceSecurityService,
    ) {
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
            'otp_code' => ['nullable', 'string', 'max:12'],
        ]);

        /** @var User|null $user */
        $user = User::query()->where('email', $validated['email'])->first();
        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->invalidCredentialsResponse();
        }

        $requiresMfa = $this->mfaService->requiresWebMfa($user);
        if ($requiresMfa) {
            if (! $user->mfa_enabled) {
                return $this->mfaEnrollmentRequiredResponse();
            }

            $otpCode = (string) ($validated['otp_code'] ?? '');
            if ($otpCode === '') {
                return $this->mfaRequiredResponse('MFA code is required for this account.');
            }

            if (! $this->mfaService->verifyCodeForUser($user, $otpCode)) {
                return response()->json([
                    'message' => 'Invalid MFA code.',
                ], 422);
            }
        }

        Auth::login($user, (bool) ($validated['remember'] ?? false));
        if (! $request->hasSession()) {
            return response()->json([
                'message' => 'Session store is unavailable for this login request. Configure SANCTUM_STATEFUL_DOMAINS and retry.',
            ], 500);
        }
        $request->session()->regenerate();

        return response()->json($this->authPayload($request, $user));
    }

    /**
     * Step 1 of email-OTP sign-in (item 15): validate credentials, then send a
     * one-time code by email. Does NOT log the user in. The TOTP login above is
     * untouched — this is an additive alternative second factor.
     */
    public function requestOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('email', $validated['email'])->first();
        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->invalidCredentialsResponse();
        }

        $challenge = $this->mfaService->issueOtp($user, 'email');

        return response()->json([
            'data' => [
                'otp_sent' => true,
                'channel' => $challenge->channel,
                'destination' => $challenge->destination,
                'expires_at' => optional($challenge->expires_at)->toIso8601String(),
            ],
        ]);
    }

    /**
     * Step 2 of email-OTP sign-in: validate credentials + the emailed code, then
     * establish the session (mirrors login()'s completion).
     */
    public function verifyOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'code' => ['required', 'string', 'max:12'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $user = User::query()->where('email', $validated['email'])->first();
        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->invalidCredentialsResponse();
        }

        if (! $this->mfaService->verifyOtp($user, $validated['code'])) {
            return response()->json([
                'message' => 'Invalid or expired verification code.',
            ], 422);
        }

        Auth::login($user, (bool) ($validated['remember'] ?? false));
        if (! $request->hasSession()) {
            return response()->json([
                'message' => 'Session store is unavailable for this login request. Configure SANCTUM_STATEFUL_DOMAINS and retry.',
            ], 500);
        }
        $request->session()->regenerate();

        return response()->json($this->authPayload($request, $user));
    }

    public function mobileLogin(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'string', 'max:40'],
            'app_version' => ['nullable', 'string', 'max:80'],
            'otp_code' => ['nullable', 'string', 'max:12'],
            'trust_device' => ['sometimes', 'boolean'],
        ]);

        /** @var User|null $user */
        $user = User::query()->where('email', $validated['email'])->first();
        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->invalidCredentialsResponse();
        }

        $deviceName = $validated['device_name'] ?? sprintf('mobile-%s', now()->format('YmdHis'));
        $deviceId = trim((string) ($validated['device_id'] ?? ''));
        if ($deviceId === '') {
            $deviceId = substr(hash('sha256', $deviceName.'|'.$request->ip().'|'.$request->userAgent()), 0, 64);
        }

        $trustedDevice = $this->mobileDeviceSecurityService->trustedDevice($user, $deviceId);
        $requiresMfa = $this->mfaService->requiresMobileMfa($user);

        if ($requiresMfa && ! $trustedDevice) {
            if (! $user->mfa_enabled) {
                return $this->mfaEnrollmentRequiredResponse();
            }

            $otpCode = (string) ($validated['otp_code'] ?? '');
            if ($otpCode === '') {
                return $this->mfaRequiredResponse('MFA code is required for this mobile login.', true);
            }

            if (! $this->mfaService->verifyCodeForUser($user, $otpCode)) {
                return response()->json([
                    'message' => 'Invalid MFA code.',
                ], 422);
            }
        }

        $token = $user->createToken($deviceName, ['*']);

        $trustDays = $this->organizationSecurityService->mobileTrustDaysForUser($user);
        $this->mobileDeviceSecurityService->registerLoginDevice(
            $user,
            $deviceId,
            $deviceName,
            $validated['platform'] ?? 'mobile',
            $validated['app_version'] ?? null,
            (bool) ($validated['trust_device'] ?? false),
            $trustDays,
            $token->accessToken->id,
            $request,
        );

        return response()->json([
            ...$this->authPayload($request, $user),
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'device_id' => $deviceId,
            'mfa_verified' => $requiresMfa,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Logged out.',
        ]);
    }

    public function mobileLogout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Logged out from mobile token.',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->authPayload($request));
    }

    public function mfaStatus(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'mfa_enabled' => (bool) $user->mfa_enabled,
                'mfa_required_web' => $this->organizationSecurityService->requiresWebMfaForUser($user),
                'mfa_required_mobile' => $this->organizationSecurityService->requiresMobileMfaForUser($user),
            ],
        ]);
    }

    public function mfaSetup(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->mfaService->generateEnrollmentSecret($user),
        ]);
    }

    public function mfaEnable(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'secret' => ['required', 'string', 'min:16', 'max:64'],
            'otp_code' => ['required', 'string', 'max:12'],
        ]);

        $updated = $this->mfaService->enableForUser(
            $user,
            strtoupper(trim((string) $validated['secret'])),
            (string) $validated['otp_code'],
        );

        return response()->json([
            'data' => [
                'mfa_enabled' => (bool) $updated->mfa_enabled,
            ],
        ]);
    }

    public function mfaDisable(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'otp_code' => ['required', 'string', 'max:12'],
        ]);

        $updated = $this->mfaService->disableForUser($user, (string) $validated['otp_code']);

        return response()->json([
            'data' => [
                'mfa_enabled' => (bool) $updated->mfa_enabled,
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function authPayload(Request $request, ?User $explicitUser = null): array
    {
        /** @var User $user */
        $user = $explicitUser ?? $request->user();

        $organizations = $user->organizations()
            ->wherePivot('is_active', true)
            ->orderBy('organizations.name')
            ->get(['organizations.id', 'organizations.name', 'organizations.code'])
            ->map(function ($organization) use ($user) {
                return [
                    'id' => $organization->id,
                    'name' => $organization->name,
                    'code' => $organization->code,
                    'roles' => $user->roleNamesForOrganization($organization->id),
                    'permissions' => $user->permissionNamesForProject($organization->id),
                    'project_permissions' => $this->accessControlService->projectScopedPermissionNames($user, $organization->id),
                    'feature_flags' => $this->featureFlagService->resolvedFlags($organization->id),
                ];
            })
            ->values();

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'mfa_enabled' => (bool) $user->mfa_enabled,
            ],
            'organizations' => $organizations,
        ];
    }

    private function invalidCredentialsResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'Invalid credentials.',
        ], 422);
    }

    private function mfaRequiredResponse(string $message, bool $mobile = false): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'mfa_required' => true,
            'mfa_type' => 'totp',
            'scope' => $mobile ? 'mobile' : 'web',
        ], 428);
    }

    private function mfaEnrollmentRequiredResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'MFA enrollment is required before signing in. Please contact your administrator.',
            'mfa_required' => true,
            'mfa_enrollment_required' => true,
            'mfa_type' => 'totp',
        ], 428);
    }
}
