<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Snag;
use App\Models\User;
use App\Models\WorkflowAutomationLog;
use App\Models\WorkflowAutomationRule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\WorkflowAutomationLog>
 */
class WorkflowAutomationLogFactory extends Factory
{
    protected $model = WorkflowAutomationLog::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'workflow_automation_rule_id' => WorkflowAutomationRule::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'snag_id' => Snag::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'triggered_by' => User::factory(),
            'trigger_event' => fake()->randomElement([
                WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
                WorkflowAutomationRule::TRIGGER_SNAG_UPDATED,
                WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED,
            ]),
            'result' => fake()->randomElement(['applied', 'skipped', 'error']),
            'message' => fake()->optional(0.5)->sentence(),
            'payload' => [
                'seeded' => true,
            ],
            'executed_at' => now()->subHours(fake()->numberBetween(1, 72)),
        ];
    }
}
