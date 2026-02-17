<?php

namespace Database\Factories;

use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagComment>
 */
class SnagCommentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'snag_id' => Snag::factory(),
            'parent_id' => null,
            'organization_id' => fn (array $attributes) => Snag::query()->find($attributes['snag_id'])?->organization_id,
            'user_id' => User::factory(),
            'body' => fake()->sentence(10),
            'is_internal' => false,
        ];
    }
}

