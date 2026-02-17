<?php

namespace Database\Factories;

use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionRecurringSchedule>
 */
class InspectionRecurringScheduleFactory extends Factory
{
    protected $model = InspectionRecurringSchedule::class;

    public function definition(): array
    {
        $startsAt = now()->subDays(fake()->numberBetween(1, 12))->setTime(8, 0);

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'inspection_template_id' => InspectionTemplate::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'name' => fake()->randomElement([
                'Weekly MIR cadence',
                'Biweekly WIR walkdown',
                'Monthly QA signoff',
            ]),
            'recurrence' => fake()->randomElement([
                InspectionRecurringSchedule::RECURRENCE_DAILY,
                InspectionRecurringSchedule::RECURRENCE_WEEKLY,
                InspectionRecurringSchedule::RECURRENCE_BIWEEKLY,
                InspectionRecurringSchedule::RECURRENCE_MONTHLY,
            ]),
            'interval_value' => fake()->numberBetween(1, 2),
            'starts_at' => $startsAt,
            'ends_at' => null,
            'next_run_at' => $startsAt->copy()->addDay(),
            'run_time' => '08:00',
            'timezone' => fake()->randomElement(['UTC', 'Asia/Riyadh', 'Europe/London']),
            'default_form_data' => [
                'seeded' => true,
            ],
            'assign_to_user_id' => User::factory(),
            'is_active' => true,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }
}
