<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\OrganizationSecuritySetting;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class AttachmentComplianceService
{
    public function __construct(
        private readonly OrganizationSecurityService $organizationSecurityService,
        private readonly AntivirusScanService $antivirusScanService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function evaluate(
        Organization $organization,
        string $absolutePath,
        string $mimeType,
        ?bool $piiRedacted,
        string $source,
        array $context = [],
    ): array {
        $settings = $this->organizationSecurityService->resolvedSettings($organization);
        $antivirusMode = (string) ($settings['antivirus_mode'] ?? OrganizationSecuritySetting::ANTIVIRUS_OFF);
        $piiMode = (string) ($settings['pii_redaction_mode'] ?? OrganizationSecuritySetting::PII_REDACTION_OFF);

        $antivirus = [
            'mode' => $antivirusMode,
            'status' => 'skipped',
            'engine' => null,
            'signature' => null,
            'message' => null,
        ];

        if ($antivirusMode !== OrganizationSecuritySetting::ANTIVIRUS_OFF) {
            $scan = $this->antivirusScanService->scanFile($absolutePath);
            $antivirus = [
                'mode' => $antivirusMode,
                'status' => $scan['status'],
                'engine' => $scan['engine'],
                'signature' => $scan['signature'],
                'message' => $scan['message'],
            ];

            if ($scan['status'] === 'infected') {
                $this->opsHealthService->recordStorageFailure(
                    $organization->id,
                    'security_antivirus_'.$source,
                    'Antivirus detected an infected file.',
                    [
                        ...$context,
                        'engine' => $scan['engine'],
                        'signature' => $scan['signature'],
                    ],
                    'critical',
                );

                if ($antivirusMode === OrganizationSecuritySetting::ANTIVIRUS_ENFORCE) {
                    throw ValidationException::withMessages([
                        'file' => ['Upload blocked by antivirus policy. Infected file signature detected.'],
                    ]);
                }
            }

            if ($scan['status'] === 'error') {
                $this->opsHealthService->recordStorageFailure(
                    $organization->id,
                    'security_antivirus_'.$source,
                    $scan['message'] ?? 'Antivirus scan error.',
                    $context,
                    'warning',
                );

                if ($antivirusMode === OrganizationSecuritySetting::ANTIVIRUS_ENFORCE) {
                    throw ValidationException::withMessages([
                        'file' => ['Upload blocked because antivirus scanning failed under enforce mode.'],
                    ]);
                }
            }
        }

        $requiresPiiReview = $this->requiresPiiRedactionCheck($mimeType);
        $pii = [
            'mode' => $piiMode,
            'status' => 'off',
            'declared_redacted' => $piiRedacted === true,
            'required_for_mime' => $requiresPiiReview,
        ];

        if ($requiresPiiReview && $piiMode !== OrganizationSecuritySetting::PII_REDACTION_OFF) {
            if ($piiRedacted === true) {
                $pii['status'] = 'declared_redacted';
            } elseif ($piiMode === OrganizationSecuritySetting::PII_REDACTION_REQUIRE) {
                throw ValidationException::withMessages([
                    'pii_redacted' => ['PII redaction confirmation is required for this file type.'],
                ]);
            } else {
                $pii['status'] = 'warning_not_confirmed';
            }
        }

        return [
            'checked_at' => Carbon::now()->toISOString(),
            'source' => $source,
            'antivirus' => $antivirus,
            'pii' => $pii,
        ];
    }

    private function requiresPiiRedactionCheck(string $mimeType): bool
    {
        return str_starts_with($mimeType, 'image/')
            || str_starts_with($mimeType, 'video/')
            || $mimeType === 'application/pdf';
    }
}

