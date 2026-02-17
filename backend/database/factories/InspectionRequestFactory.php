<?php

namespace Database\Factories;

use App\Models\InspectionRequest;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionRequest>
 */
class InspectionRequestFactory extends Factory
{
    public function definition(): array
    {
        $status = fake()->randomElement([
            InspectionRequest::STATUS_REQUESTED,
            InspectionRequest::STATUS_SCHEDULED,
            InspectionRequest::STATUS_IN_PROGRESS,
            InspectionRequest::STATUS_COMPLETED,
            InspectionRequest::STATUS_REJECTED,
        ]);

        $scheduledAt = in_array($status, [
            InspectionRequest::STATUS_SCHEDULED,
            InspectionRequest::STATUS_IN_PROGRESS,
            InspectionRequest::STATUS_COMPLETED,
        ], true) ? Carbon::now()->addDays(fake()->numberBetween(1, 7)) : null;

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'inspection_submission_id' => null,
            'reference' => 'REQ-'.fake()->unique()->numerify('#####'),
            'request_type' => fake()->randomElement([InspectionRequest::TYPE_MIR, InspectionRequest::TYPE_WIR, InspectionRequest::TYPE_IR]),
            'title' => fake()->randomElement([
                'Material approval request',
                'Work inspection request',
                'Site readiness request',
                'Final verification request',
            ]),
            'description' => fake()->optional()->sentence(),
            'status' => $status,
            'requested_by' => User::factory(),
            'assigned_to' => fake()->boolean(80) ? User::factory() : null,
            'scheduled_for' => $scheduledAt,
            'completed_at' => $status === InspectionRequest::STATUS_COMPLETED ? Carbon::now()->subHours(fake()->numberBetween(1, 48)) : null,
            'metadata' => ['seeded' => true],
        ];
    }
}
