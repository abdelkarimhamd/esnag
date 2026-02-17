<?php

namespace Database\Factories;

use App\Models\Floor;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Location>
 */
class LocationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'floor_id' => Floor::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement(['Lobby', 'Corridor', 'Apartment', 'Mechanical Room', 'Stairwell']).' '.fake()->numberBetween(1, 20),
            'code' => Str::upper(fake()->bothify('LOC-###')),
            'type' => fake()->randomElement(['room', 'corridor', 'external']),
            'barcode' => fake()->optional(0.6)->bothify('BC-########'),
        ];
    }
}

