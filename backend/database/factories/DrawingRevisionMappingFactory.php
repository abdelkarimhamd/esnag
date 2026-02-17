<?php

namespace Database\Factories;

use App\Models\Drawing;
use App\Models\DrawingRevision;
use App\Models\DrawingRevisionMapping;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DrawingRevisionMapping>
 */
class DrawingRevisionMappingFactory extends Factory
{
    protected $model = DrawingRevisionMapping::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'drawing_id' => Drawing::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'from_revision_id' => DrawingRevision::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'drawing_id' => $attributes['drawing_id'],
            ]),
            'to_revision_id' => DrawingRevision::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'drawing_id' => $attributes['drawing_id'],
            ]),
            'transform_type' => fake()->randomElement(['identity', 'offset_scale']),
            'transform_params' => fake()->boolean(55)
                ? []
                : [
                    'scale_x' => 1,
                    'scale_y' => 1,
                    'offset_x' => fake()->randomFloat(4, -0.08, 0.08),
                    'offset_y' => fake()->randomFloat(4, -0.08, 0.08),
                ],
            'confidence_score' => fake()->randomFloat(2, 60, 98),
            'notes' => fake()->optional()->sentence(),
            'created_by' => User::factory(),
        ];
    }
}
