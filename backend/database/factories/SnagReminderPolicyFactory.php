<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\SnagReminderPolicy;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagReminderPolicy>
 */
class SnagReminderPolicyFactory extends Factory
{
    protected $model = SnagReminderPolicy::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement([
                'Assigned snag nudge',
                'In-progress reminder',
                'Ready-for-review follow-up',
            ]),
            'statuses' => ['assigned', 'in_progress'],
            'reminder_every_hours' => fake()->numberBetween(4, 24),
            'max_reminders' => fake()->numberBetween(2, 8),
            'is_active' => true,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }
}
