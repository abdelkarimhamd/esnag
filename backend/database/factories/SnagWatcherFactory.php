<?php

namespace Database\Factories;

use App\Models\Snag;
use App\Models\SnagWatcher;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagWatcher>
 */
class SnagWatcherFactory extends Factory
{
    protected $model = SnagWatcher::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn (array $attributes) => Snag::query()->find($attributes['snag_id'])?->organization_id,
            'snag_id' => Snag::factory(),
            'user_id' => User::factory(),
            'source' => fake()->randomElement(['manual', 'assigned', 'comment', 'mention', 'team_mention']),
            'created_by' => null,
        ];
    }
}
