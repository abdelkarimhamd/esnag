<?php

namespace Database\Factories;

use App\Models\DelegationRule;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DelegationRule>
 */
class DelegationRuleFactory extends Factory
{
    protected $model = DelegationRule::class;

    public function definition(): array
    {
        $startsAt = now()->subDay();

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory(),
            'delegator_user_id' => User::factory(),
            'delegate_user_id' => User::factory(),
            'scope' => fake()->randomElement([
                DelegationRule::SCOPE_ALL,
                DelegationRule::SCOPE_ASSIGNMENTS,
                DelegationRule::SCOPE_APPROVALS,
            ]),
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addDays(10),
            'is_active' => true,
            'reason' => fake()->optional()->sentence(),
            'created_by' => null,
        ];
    }
}
