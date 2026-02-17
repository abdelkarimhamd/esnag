<?php

namespace Database\Factories;

use App\Models\Location;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Equipment>
 */
class EquipmentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'location_id' => Location::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'code' => fake()->unique()->bothify('EQ-####'),
            'name' => fake()->randomElement([
                'Pump Unit',
                'Electrical Panel',
                'AHU',
                'Fire Extinguisher',
                'Access Control Reader',
            ]).' '.fake()->numberBetween(1, 60),
            'category' => fake()->randomElement(['mep', 'fire', 'electrical', 'finishes', 'security']),
            'barcode' => fake()->optional(0.7)->bothify('EQBC-########'),
            'serial_number' => fake()->optional(0.7)->bothify('SN-########'),
            'manufacturer' => fake()->optional(0.8)->company(),
            'model' => fake()->optional(0.8)->bothify('M-###'),
            'status' => fake()->randomElement(['ok', 'warn', 'critical', 'inactive']),
            'installed_at' => fake()->optional(0.75)->dateTimeBetween('-24 months', '-1 month'),
            'last_maintenance_at' => fake()->optional(0.7)->dateTimeBetween('-6 months', 'now'),
            'notes' => fake()->optional()->sentence(12),
            'created_by' => User::factory(),
        ];
    }
}
