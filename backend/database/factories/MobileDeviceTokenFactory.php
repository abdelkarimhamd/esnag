<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\MobileDeviceToken>
 */
class MobileDeviceTokenFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'platform' => fake()->randomElement(['expo', 'ios', 'android']),
            'push_token' => 'ExponentPushToken['.fake()->bothify('????????????????????????') .']',
            'device_name' => fake()->optional(0.75)->randomElement(['Pixel 8', 'iPhone 15', 'Galaxy S24', 'iPad']),
            'app_version' => fake()->optional(0.8)->randomElement(['1.0.0', '1.0.1', '1.1.0']),
            'is_active' => true,
            'last_seen_at' => Carbon::now()->subMinutes(fake()->numberBetween(1, 600)),
        ];
    }
}
