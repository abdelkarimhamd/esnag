<?php

namespace Database\Factories;

use App\Models\InspectionApproval;
use App\Models\InspectionApprovalMessage;
use App\Models\InspectionSubmission;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionApprovalMessage>
 */
class InspectionApprovalMessageFactory extends Factory
{
    protected $model = InspectionApprovalMessage::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn (array $attributes) => InspectionSubmission::query()->find($attributes['inspection_submission_id'])?->organization_id,
            'inspection_submission_id' => InspectionSubmission::factory(),
            'inspection_approval_id' => null,
            'user_id' => User::factory(),
            'message_type' => fake()->randomElement(['comment', 'decision', 'system']),
            'body' => fake()->sentence(10),
            'payload' => ['source' => 'seed'],
        ];
    }

    public function forApproval(InspectionApproval $approval): self
    {
        return $this->state([
            'organization_id' => $approval->organization_id,
            'inspection_submission_id' => $approval->inspection_submission_id,
            'inspection_approval_id' => $approval->id,
        ]);
    }
}
