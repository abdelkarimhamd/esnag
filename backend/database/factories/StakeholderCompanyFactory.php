<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\StakeholderCompany;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StakeholderCompany>
 */
class StakeholderCompanyFactory extends Factory
{
    protected $model = StakeholderCompany::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'name' => fake()->company(),
            'code' => strtoupper(fake()->bothify('CMP-###')),
            'type' => fake()->randomElement(['owner', 'consultant', 'contractor', 'subcontractor']),
            'is_active' => true,
            'meta' => null,
        ];
    }
}
