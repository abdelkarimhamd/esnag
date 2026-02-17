<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkflowAutomationRule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\WorkflowAutomationRule>
 */
class WorkflowAutomationRuleFactory extends Factory
{
    protected $model = WorkflowAutomationRule::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement([
                'Electrical high-priority assignment',
                'Rejected twice escalation',
                'Critical snag due date guard',
            ]),
            'description' => fake()->sentence(),
            'trigger_event' => fake()->randomElement([
                WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
                WorkflowAutomationRule::TRIGGER_SNAG_UPDATED,
                WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED,
            ]),
            'conditions' => [
                'trade' => ['Electrical'],
                'priority' => ['high', 'critical'],
            ],
            'actions' => [
                'due_in_hours' => 48,
            ],
            'priority' => fake()->numberBetween(10, 300),
            'run_once_per_snag' => fake()->boolean(45),
            'is_active' => true,
            'last_triggered_at' => null,
            'trigger_count' => 0,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }
}
