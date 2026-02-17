<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StakeholderTeam>
 */
class StakeholderTeamFactory extends Factory
{
    protected $model = StakeholderTeam::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory(),
            'company_id' => StakeholderCompany::factory(),
            'name' => fake()->randomElement(['Civil Team', 'MEP Team', 'Finishes Crew', 'QA Cell']),
            'code' => strtoupper(fake()->bothify('TM-###')),
            'is_active' => true,
            'meta' => null,
        ];
    }
}
