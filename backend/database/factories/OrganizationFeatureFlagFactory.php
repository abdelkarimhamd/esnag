<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationFeatureFlag;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OrganizationFeatureFlag>
 */
class OrganizationFeatureFlagFactory extends Factory
{
    protected $model = OrganizationFeatureFlag::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'project_id' => null,
            'feature_key' => fake()->randomElement([
                'drawings',
                'kanban',
                'dashboard',
                'exports',
                'inspections',
                'equipment',
                'automation',
                'mobile',
            ]),
            'is_enabled' => fake()->boolean(80),
            'meta' => null,
            'updated_by' => User::factory(),
        ];
    }

    public function forProject(Project $project): self
    {
        return $this->state(fn () => [
            'organization_id' => $project->organization_id,
            'project_id' => $project->id,
        ]);
    }
}
