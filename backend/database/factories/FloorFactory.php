<?php

namespace Database\Factories;

use App\Models\Building;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Floor>
 */
class FloorFactory extends Factory
{
    public function definition(): array
    {
        $level = fake()->numberBetween(-1, 20);

        return [
            'organization_id' => Organization::factory(),
            'building_id' => Building::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => $level < 0 ? 'Basement '.abs($level) : 'Floor '.$level,
            'code' => $level < 0 ? 'B'.abs($level) : 'F'.$level,
            'level' => $level,
            'sort_order' => $level + 10,
        ];
    }
}

