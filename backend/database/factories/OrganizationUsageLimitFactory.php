<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationUsageLimit;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OrganizationUsageLimit>
 */
class OrganizationUsageLimitFactory extends Factory
{
    protected $model = OrganizationUsageLimit::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'storage_quota_mb' => fake()->numberBetween(1024, 10240),
            'max_exports_per_day' => fake()->numberBetween(25, 200),
            'max_users' => fake()->numberBetween(50, 500),
            'meta' => null,
            'updated_by' => User::factory(),
        ];
    }
}

