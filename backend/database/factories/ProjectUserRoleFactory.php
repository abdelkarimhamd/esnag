<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\ProjectUserRole;
use App\Models\User;
use App\Support\PermissionCatalog;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProjectUserRole>
 */
class ProjectUserRoleFactory extends Factory
{
    protected $model = ProjectUserRole::class;

    public function definition(): array
    {
        $roles = array_keys(PermissionCatalog::roleMap());

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory(),
            'user_id' => User::factory(),
            'role_name' => fake()->randomElement($roles),
            'source' => 'manual',
        ];
    }
}
