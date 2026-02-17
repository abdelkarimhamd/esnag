<?php

namespace Database\Factories;

use App\Enums\SnagStatus;
use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagStatusHistory>
 */
class SnagStatusHistoryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'snag_id' => Snag::factory(),
            'organization_id' => fn (array $attributes) => Snag::query()->find($attributes['snag_id'])?->organization_id,
            'from_status' => SnagStatus::New->value,
            'to_status' => fake()->randomElement([
                SnagStatus::Assigned->value,
                SnagStatus::InProgress->value,
                SnagStatus::ReadyForReview->value,
            ]),
            'changed_by' => User::factory(),
            'note' => fake()->optional()->sentence(),
            'metadata' => null,
            'created_at' => fake()->dateTimeBetween('-30 days', 'now'),
        ];
    }
}

