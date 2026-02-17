<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\RootCauseCategory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\RootCauseCategory>
 */
class RootCauseCategoryFactory extends Factory
{
    protected $model = RootCauseCategory::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'name' => fake()->unique()->randomElement([
                'Design Coordination',
                'Material Defect',
                'Installation Error',
                'Workmanship',
                'Documentation Gap',
                'Access Constraint',
            ]),
            'code' => strtoupper(fake()->bothify('RC-###')),
            'description' => fake()->optional()->sentence(),
            'is_active' => true,
            'created_by' => User::factory(),
        ];
    }
}

