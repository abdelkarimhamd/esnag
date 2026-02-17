<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationSecuritySetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OrganizationSecuritySetting>
 */
class OrganizationSecuritySettingFactory extends Factory
{
    protected $model = OrganizationSecuritySetting::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'mfa_required_web' => fake()->boolean(20),
            'mfa_required_mobile' => fake()->boolean(30),
            'mobile_device_trust_days' => fake()->numberBetween(7, 60),
            'enforce_ip_allowlist' => fake()->boolean(20),
            'ip_allowlist' => ['127.0.0.1/32', '10.0.0.0/8'],
            'antivirus_mode' => fake()->randomElement(['off', 'log_only', 'enforce']),
            'pii_redaction_mode' => fake()->randomElement(['off', 'warn', 'require']),
            'meta' => null,
            'updated_by' => User::factory(),
        ];
    }
}

