<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CloseoutTemplate>
 */
class CloseoutTemplateFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement(['MEP', 'Architectural', 'Civil', 'Facade']).' Closeout Checklist',
            'trade' => fake()->randomElement(['MEP', 'Architectural', 'Civil', 'Facade']),
            'discipline' => fake()->randomElement(['Architectural', 'Civil', 'MEP', 'QA/QC']),
            'description' => fake()->optional()->sentence(),
            'is_default' => false,
            'is_active' => true,
            'is_library' => false,
            'library_key' => null,
            'created_by' => User::factory(),
        ];
    }
}
