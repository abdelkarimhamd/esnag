<?php

namespace Database\Factories;

use App\Models\Drawing;
use App\Models\DrawingLocationZone;
use App\Models\DrawingRevision;
use App\Models\Location;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DrawingLocationZone>
 */
class DrawingLocationZoneFactory extends Factory
{
    protected $model = DrawingLocationZone::class;

    public function definition(): array
    {
        $xMin = fake()->randomFloat(4, 0.01, 0.72);
        $yMin = fake()->randomFloat(4, 0.01, 0.72);
        $width = fake()->randomFloat(4, 0.12, 0.26);
        $height = fake()->randomFloat(4, 0.12, 0.26);

        return [
            'organization_id' => Organization::factory(),
            'drawing_id' => Drawing::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'drawing_revision_id' => null,
            'location_id' => Location::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'zone_label' => fake()->randomElement(['Room', 'Corridor', 'Service Zone']).' '.fake()->numberBetween(1, 20),
            'x_min' => $xMin,
            'y_min' => $yMin,
            'x_max' => min(0.99, $xMin + $width),
            'y_max' => min(0.99, $yMin + $height),
            'priority' => fake()->numberBetween(80, 140),
            'metadata' => [
                'seeded' => true,
            ],
            'created_by' => User::factory(),
        ];
    }

    public function forRevision(DrawingRevision $revision): self
    {
        return $this->state(fn (array $attributes) => [
            'organization_id' => $revision->organization_id,
            'drawing_id' => $revision->drawing_id,
            'drawing_revision_id' => $revision->id,
            'location_id' => Location::factory()->state([
                'organization_id' => $revision->organization_id,
            ]),
            'created_by' => $attributes['created_by'] ?? null,
        ]);
    }
}
