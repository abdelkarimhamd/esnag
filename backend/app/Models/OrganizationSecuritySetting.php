<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationSecuritySetting extends Model
{
    /** @use HasFactory<\Database\Factories\OrganizationSecuritySettingFactory> */
    use HasFactory;

    public const ANTIVIRUS_OFF = 'off';
    public const ANTIVIRUS_LOG_ONLY = 'log_only';
    public const ANTIVIRUS_ENFORCE = 'enforce';

    public const PII_REDACTION_OFF = 'off';
    public const PII_REDACTION_WARN = 'warn';
    public const PII_REDACTION_REQUIRE = 'require';

    protected $fillable = [
        'organization_id',
        'mfa_required_web',
        'mfa_required_mobile',
        'mobile_device_trust_days',
        'enforce_ip_allowlist',
        'ip_allowlist',
        'antivirus_mode',
        'pii_redaction_mode',
        'meta',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'mfa_required_web' => 'boolean',
            'mfa_required_mobile' => 'boolean',
            'mobile_device_trust_days' => 'integer',
            'enforce_ip_allowlist' => 'boolean',
            'ip_allowlist' => 'array',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

