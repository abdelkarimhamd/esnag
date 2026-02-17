<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\InspectionRecurringRun;
use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionSubmission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionRecurringRun>
 */
class InspectionRecurringRunFactory extends Factory
{
    protected $model = InspectionRecurringRun::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'inspection_recurring_schedule_id' => InspectionRecurringSchedule::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'inspection_submission_id' => InspectionSubmission::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'run_at' => now()->subHours(fake()->numberBetween(1, 72)),
            'status' => fake()->randomElement(['generated', 'skipped', 'failed']),
            'message' => fake()->optional(0.5)->sentence(),
            'payload' => [
                'seeded' => true,
            ],
        ];
    }
}
