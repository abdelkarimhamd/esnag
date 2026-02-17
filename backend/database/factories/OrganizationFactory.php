<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Organization>
 */
class OrganizationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->company().' Construction',
            'code' => Str::upper(fake()->unique()->bothify('ORG-###')),
            'description' => fake()->sentence(),
        ];
    }
}

