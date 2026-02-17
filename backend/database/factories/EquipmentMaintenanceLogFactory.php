<?php

namespace Database\Factories;

use App\Models\Equipment;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\EquipmentMaintenanceLog>
 */
class EquipmentMaintenanceLogFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'equipment_id' => Equipment::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'snag_id' => null,
            'performed_by' => User::factory(),
            'status' => fake()->randomElement(['ok', 'warn', 'critical']),
            'description' => fake()->sentence(10),
            'action_taken' => fake()->optional(0.7)->sentence(8),
            'occurred_at' => fake()->dateTimeBetween('-6 months', 'now'),
            'next_due_at' => fake()->optional(0.6)->dateTimeBetween('now', '+4 months'),
            'metadata' => [
                'source' => fake()->randomElement(['scheduled', 'reactive', 'inspection']),
                'seeded' => true,
            ],
        ];
    }
}
