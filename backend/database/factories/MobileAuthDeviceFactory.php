<?php

namespace Database\Factories;

use App\Models\MobileAuthDevice;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\MobileAuthDevice>
 */
class MobileAuthDeviceFactory extends Factory
{
    protected $model = MobileAuthDevice::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'device_id' => Str::uuid()->toString(),
            'device_name' => fake()->randomElement(['iPhone 15', 'Samsung S24', 'Pixel 9']),
            'platform' => fake()->randomElement(['ios', 'android']),
            'app_version' => '1.'.fake()->numberBetween(0, 9).'.'.fake()->numberBetween(0, 12),
            'is_active' => true,
            'trusted_until' => Carbon::now()->addDays(fake()->numberBetween(3, 30)),
            'last_token_id' => null,
            'last_ip' => fake()->ipv4(),
            'last_user_agent' => fake()->userAgent(),
            'last_seen_at' => Carbon::now()->subHours(fake()->numberBetween(0, 72)),
            'meta' => null,
        ];
    }
}

