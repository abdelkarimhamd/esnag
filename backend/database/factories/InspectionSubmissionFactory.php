<?php

namespace Database\Factories;

use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionSubmission>
 */
class InspectionSubmissionFactory extends Factory
{
    public function definition(): array
    {
        $status = fake()->randomElement([
            InspectionSubmission::STATUS_DRAFT,
            InspectionSubmission::STATUS_SUBMITTED,
            InspectionSubmission::STATUS_IN_REVIEW,
            InspectionSubmission::STATUS_APPROVED,
            InspectionSubmission::STATUS_REJECTED,
        ]);

        $submittedAt = in_array($status, [
            InspectionSubmission::STATUS_SUBMITTED,
            InspectionSubmission::STATUS_IN_REVIEW,
            InspectionSubmission::STATUS_APPROVED,
            InspectionSubmission::STATUS_REJECTED,
        ], true) ? Carbon::now()->subDays(fake()->numberBetween(1, 20)) : null;

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'inspection_template_id' => InspectionTemplate::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'project_id' => $attributes['project_id'],
            ]),
            'reference' => 'INSP-'.fake()->unique()->numerify('#####'),
            'status' => $status,
            'form_data' => [
                'summary' => fake()->sentence(),
                'severity' => fake()->randomElement(['low', 'medium', 'high']),
                'is_safe' => fake()->boolean(),
            ],
            'current_approval_order' => in_array($status, [InspectionSubmission::STATUS_SUBMITTED, InspectionSubmission::STATUS_IN_REVIEW], true) ? 1 : null,
            'created_by' => User::factory(),
            'submitted_by' => $submittedAt ? User::factory() : null,
            'submitted_at' => $submittedAt,
            'approved_at' => $status === InspectionSubmission::STATUS_APPROVED ? Carbon::now()->subDays(fake()->numberBetween(0, 10)) : null,
            'rejected_at' => $status === InspectionSubmission::STATUS_REJECTED ? Carbon::now()->subDays(fake()->numberBetween(0, 10)) : null,
            'last_updated_by' => User::factory(),
        ];
    }
}
