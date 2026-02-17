<?php

namespace Database\Factories;

use App\Enums\SnagStatus;
use App\Models\Drawing;
use App\Models\Organization;
use App\Models\Project;
use App\Models\RootCauseCategory;
use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Snag>
 */
class SnagFactory extends Factory
{
    public function definition(): array
    {
        $status = fake()->randomElement([
            SnagStatus::New->value,
            SnagStatus::Assigned->value,
            SnagStatus::InProgress->value,
            SnagStatus::ReadyForReview->value,
        ]);

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'drawing_id' => Drawing::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'drawing_revision_id' => null,
            'building_id' => null,
            'floor_id' => null,
            'location_id' => null,
            'root_cause_category_id' => null,
            'reference' => 'SNG-'.fake()->unique()->numberBetween(10000, 99999),
            'title' => fake()->randomElement([
                'Paint damage near door frame',
                'Cracked tile in corridor',
                'Loose electrical socket',
                'Water seepage at ceiling edge',
                'HVAC diffuser misaligned',
            ]),
            'description' => fake()->sentence(12),
            'priority' => fake()->randomElement(Snag::PRIORITIES),
            'trade' => fake()->randomElement(['Electrical', 'Mechanical', 'Civil', 'Architectural', 'Safety']),
            'status' => $status,
            'pin_x' => fake()->randomFloat(6, 0.01, 0.99),
            'pin_y' => fake()->randomFloat(6, 0.01, 0.99),
            'created_by' => User::factory(),
            'assigned_to' => $status === SnagStatus::New->value ? null : User::factory(),
            'due_date' => fake()->optional()->dateTimeBetween('+2 days', '+40 days'),
            'estimated_cost' => fake()->optional(0.45)->randomFloat(2, 150, 15000),
            'estimated_hours' => fake()->optional(0.5)->randomFloat(2, 1.5, 120),
            'acknowledged_at' => null,
            'started_at' => null,
            'ready_for_review_at' => null,
            'closed_at' => null,
        ];
    }

    public function withRootCause(): self
    {
        return $this->state(fn (array $attributes) => [
            'root_cause_category_id' => RootCauseCategory::factory()->state([
                'organization_id' => $attributes['organization_id'],
            ]),
        ]);
    }
}

