<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Snag;
use App\Models\SnagReminderLog;
use App\Models\SnagReminderPolicy;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagReminderLog>
 */
class SnagReminderLogFactory extends Factory
{
    protected $model = SnagReminderLog::class;

    public function definition(): array
    {
        $remindedAt = now()->subHours(fake()->numberBetween(1, 24));

        return [
            'organization_id' => Organization::factory(),
            'snag_id' => Snag::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'snag_reminder_policy_id' => SnagReminderPolicy::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'user_id' => User::factory(),
            'reminder_count' => fake()->numberBetween(1, 5),
            'reminded_at' => $remindedAt,
            'next_due_at' => $remindedAt->copy()->addHours(fake()->numberBetween(4, 24)),
        ];
    }
}
