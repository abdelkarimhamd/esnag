<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationInvite;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OrganizationInvite>
 */
class OrganizationInviteFactory extends Factory
{
    protected $model = OrganizationInvite::class;

    public function definition(): array
    {
        $invitedAt = Carbon::now()->subDays(fake()->numberBetween(0, 4));

        return [
            'organization_id' => Organization::factory(),
            'email' => fake()->unique()->safeEmail(),
            'token' => Str::random(60),
            'status' => fake()->randomElement(['pending', 'pending', 'accepted', 'expired']),
            'invited_by' => User::factory(),
            'invited_at' => $invitedAt,
            'last_sent_at' => $invitedAt,
            'send_count' => fake()->numberBetween(1, 4),
            'expires_at' => $invitedAt->copy()->addDays(7),
            'accepted_at' => fake()->optional(0.35)->dateTimeBetween($invitedAt, 'now'),
            'meta' => null,
        ];
    }
}

