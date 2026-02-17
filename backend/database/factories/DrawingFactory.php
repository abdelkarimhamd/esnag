<?php

namespace Database\Factories;

use App\Models\Building;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Drawing>
 */
class DrawingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'building_id' => Building::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'floor_id' => Floor::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'building_id' => $attributes['building_id'],
            ]),
            'title' => fake()->randomElement(['General Arrangement', 'Electrical Layout', 'Plumbing Plan', 'Ceiling Plan']).' '.fake()->numberBetween(1, 50),
            'code' => Str::upper(fake()->unique()->bothify('DRW-###')),
            'description' => fake()->optional()->sentence(),
            'current_revision_id' => null,
        ];
    }
}

