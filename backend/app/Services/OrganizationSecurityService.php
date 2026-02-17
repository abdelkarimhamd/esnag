<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\OrganizationSecuritySetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class OrganizationSecurityService
{
    /**
     * @return array{
     *   mfa_required_web: bool,
     *   mfa_required_mobile: bool,
     *   mobile_device_trust_days: int,
     *   enforce_ip_allowlist: bool,
     *   ip_allowlist: array<int, string>,
     *   antivirus_mode: string,
     *   pii_redaction_mode: string,
     *   meta: array<string, mixed>|null
     * }
     */
    public function defaults(): array
    {
        return [
            'mfa_required_web' => false,
            'mfa_required_mobile' => false,
            'mobile_device_trust_days' => max(1, (int) config('security.default_mobile_trust_days', 30)),
            'enforce_ip_allowlist' => false,
            'ip_allowlist' => [],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_OFF,
            'meta' => null,
        ];
    }

    public function ensureSettings(Organization $organization, ?int $updatedBy = null): OrganizationSecuritySetting
    {
        $defaults = $this->defaults();

        return OrganizationSecuritySetting::query()->firstOrCreate(
            ['organization_id' => $organization->id],
            [
                ...$defaults,
                'updated_by' => $updatedBy,
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function updateSettings(Organization $organization, array $attributes, ?int $updatedBy = null): OrganizationSecuritySetting
    {
        $settings = $this->ensureSettings($organization, $updatedBy);

        if (array_key_exists('ip_allowlist', $attributes)) {
            $attributes['ip_allowlist'] = collect($attributes['ip_allowlist'] ?? [])
                ->map(fn ($value) => trim((string) $value))
                ->filter(fn (string $value) => $value !== '')
                ->unique()
                ->values()
                ->all();
        }

        $settings->fill([
            ...$attributes,
            'updated_by' => $updatedBy,
        ]);
        $settings->save();

        return $settings;
    }

    /**
     * @return array{
     *   mfa_required_web: bool,
     *   mfa_required_mobile: bool,
     *   mobile_device_trust_days: int,
     *   enforce_ip_allowlist: bool,
     *   ip_allowlist: array<int, string>,
     *   antivirus_mode: string,
     *   pii_redaction_mode: string,
     *   meta: array<string, mixed>|null
     * }
     */
    public function resolvedSettings(Organization|int $organization): array
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;
        $row = OrganizationSecuritySetting::query()
            ->where('organization_id', $organizationId)
            ->first();

        if (! $row) {
            return $this->defaults();
        }

        return [
            'mfa_required_web' => (bool) $row->mfa_required_web,
            'mfa_required_mobile' => (bool) $row->mfa_required_mobile,
            'mobile_device_trust_days' => max(1, (int) $row->mobile_device_trust_days),
            'enforce_ip_allowlist' => (bool) $row->enforce_ip_allowlist,
            'ip_allowlist' => collect($row->ip_allowlist ?? [])->map(fn ($value) => (string) $value)->values()->all(),
            'antivirus_mode' => in_array(
                $row->antivirus_mode,
                [
                    OrganizationSecuritySetting::ANTIVIRUS_OFF,
                    OrganizationSecuritySetting::ANTIVIRUS_LOG_ONLY,
                    OrganizationSecuritySetting::ANTIVIRUS_ENFORCE,
                ],
                true
            ) ? $row->antivirus_mode : OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => in_array(
                $row->pii_redaction_mode,
                [
                    OrganizationSecuritySetting::PII_REDACTION_OFF,
                    OrganizationSecuritySetting::PII_REDACTION_WARN,
                    OrganizationSecuritySetting::PII_REDACTION_REQUIRE,
                ],
                true
            ) ? $row->pii_redaction_mode : OrganizationSecuritySetting::PII_REDACTION_OFF,
            'meta' => is_array($row->meta) ? $row->meta : null,
        ];
    }

    public function requiresWebMfaForUser(User $user): bool
    {
        return DB::table('organization_user')
            ->join('organization_security_settings', 'organization_security_settings.organization_id', '=', 'organization_user.organization_id')
            ->where('organization_user.user_id', $user->id)
            ->where('organization_user.is_active', true)
            ->where('organization_security_settings.mfa_required_web', true)
            ->exists();
    }

    public function requiresMobileMfaForUser(User $user): bool
    {
        return DB::table('organization_user')
            ->join('organization_security_settings', 'organization_security_settings.organization_id', '=', 'organization_user.organization_id')
            ->where('organization_user.user_id', $user->id)
            ->where('organization_user.is_active', true)
            ->where('organization_security_settings.mfa_required_mobile', true)
            ->exists();
    }

    public function mobileTrustDaysForUser(User $user): int
    {
        $default = max(1, (int) config('security.default_mobile_trust_days', 30));

        $max = (int) DB::table('organization_user')
            ->join('organization_security_settings', 'organization_security_settings.organization_id', '=', 'organization_user.organization_id')
            ->where('organization_user.user_id', $user->id)
            ->where('organization_user.is_active', true)
            ->max('organization_security_settings.mobile_device_trust_days');

        return $max > 0 ? $max : $default;
    }
}

