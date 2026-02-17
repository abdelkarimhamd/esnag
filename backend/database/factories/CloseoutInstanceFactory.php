<?php

namespace Database\Factories;

use App\Models\CloseoutTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CloseoutInstance>
 */
class CloseoutInstanceFactory extends Factory
{
    public function definition(): array
    {
        $completion = fake()->numberBetween(0, 100);
        $status = $completion === 0 ? 'not_started' : ($completion < 100 ? 'in_progress' : 'completed');

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'snag_id' => Snag::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'closeout_template_id' => CloseoutTemplate::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'status' => $status,
            'completion_percentage' => $completion,
            'created_by' => User::factory(),
            'reviewed_by' => null,
            'completed_at' => $completion === 100 ? now() : null,
            'reviewed_at' => null,
        ];
    }
}
