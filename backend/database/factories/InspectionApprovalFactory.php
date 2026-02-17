<?php

namespace Database\Factories;

use App\Models\InspectionApproval;
use App\Models\InspectionSubmission;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionApproval>
 */
class InspectionApprovalFactory extends Factory
{
    public function definition(): array
    {
        $status = fake()->randomElement([
            InspectionApproval::STATUS_PENDING,
            InspectionApproval::STATUS_APPROVED,
            InspectionApproval::STATUS_REJECTED,
        ]);

        $actedAt = $status === InspectionApproval::STATUS_PENDING
            ? null
            : Carbon::now()->subDays(fake()->numberBetween(0, 7));

        return [
            'organization_id' => Organization::factory(),
            'inspection_submission_id' => InspectionSubmission::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'step_order' => fake()->numberBetween(1, 3),
            'step_name' => fake()->randomElement(['Consultant Review', 'Client Approval', 'Safety Sign-Off']),
            'role_name' => fake()->randomElement(['inspector', 'project_manager', 'org_admin']),
            'requires_signature' => fake()->boolean(35),
            'status' => $status,
            'approver_id' => $actedAt ? User::factory() : null,
            'decision_notes' => $actedAt ? fake()->optional()->sentence() : null,
            'acted_at' => $actedAt,
        ];
    }
}
