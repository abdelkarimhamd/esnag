<?php

namespace Database\Factories;

use App\Models\Drawing;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DrawingRevision>
 */
class DrawingRevisionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'drawing_id' => Drawing::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'revision_label' => 'R'.fake()->numberBetween(1, 9),
            'file_name' => fake()->bothify('drawing-###.png'),
            'file_path' => 'drawings/demo/'.fake()->bothify('drawing-###.png'),
            'mime_type' => 'image/png',
            'file_size' => fake()->numberBetween(10000, 500000),
            'uploaded_by' => User::factory(),
            'notes' => fake()->optional()->sentence(),
            'is_current' => false,
        ];
    }
}

