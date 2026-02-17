<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\NotificationPreference>
 */
class NotificationPreferenceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'digest_frequency' => fake()->randomElement(['off', 'daily', 'weekly', 'monthly']),
            'email_enabled' => true,
            'in_app_enabled' => true,
            'push_enabled' => fake()->boolean(55),
            'immediate_assignment' => true,
            'immediate_status_change' => true,
            'immediate_comment' => true,
            'immediate_mention' => true,
            'immediate_escalation' => true,
            'approval_needed' => true,
            'signature_requested' => true,
            'quiet_hours_start' => fake()->optional(0.35)->randomElement(['22:00', '23:00', '00:00']),
            'quiet_hours_end' => fake()->optional(0.35)->randomElement(['06:00', '07:00', '08:00']),
            'timezone' => fake()->randomElement(['UTC', 'Asia/Riyadh', 'Europe/London', 'America/New_York']),
            'last_daily_sent_at' => fake()->optional(0.4)->dateTimeBetween('-2 days', 'now'),
            'last_weekly_sent_at' => fake()->optional(0.35)->dateTimeBetween('-10 days', 'now'),
            'last_monthly_sent_at' => fake()->optional(0.3)->dateTimeBetween('-40 days', 'now'),
        ];
    }
}
