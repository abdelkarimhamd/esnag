<?php

namespace Database\Factories;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Project>
 */
class ProjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'name' => fake()->words(3, true).' Project',
            'code' => Str::upper(fake()->unique()->bothify('PRJ-###')),
            'description' => fake()->paragraph(),
            'status' => fake()->randomElement(['active', 'planning']),
            'is_training' => false,
            'training_locked' => false,
            'training_notes' => null,
            'start_date' => fake()->dateTimeBetween('-12 months', '-1 month'),
            'end_date' => fake()->optional()->dateTimeBetween('+1 month', '+12 months'),
        ];
    }
}

