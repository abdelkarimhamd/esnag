<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OnboardingTourProgress>
 */
class OnboardingTourProgressFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'tour_key' => 'core',
            'current_step' => fake()->numberBetween(0, 5),
            'last_viewed_at' => fake()->dateTimeBetween('-3 days', 'now'),
            'completed_at' => fake()->optional(0.5)->dateTimeBetween('-2 days', 'now'),
            'skipped_at' => null,
            'meta' => ['source' => 'seed'],
        ];
    }
}

