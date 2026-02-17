<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\SnagEscalationRule;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagEscalationRule>
 */
class SnagEscalationRuleFactory extends Factory
{
    protected $model = SnagEscalationRule::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement(['Overdue escalation', 'Critical backlog escalation']),
            'overdue_days' => fake()->numberBetween(2, 7),
            'escalate_to_roles' => ['consultant', 'owner'],
            'cooldown_hours' => 24,
            'is_active' => true,
            'last_evaluated_at' => null,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }
}
