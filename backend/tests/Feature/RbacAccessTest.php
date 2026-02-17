<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class RbacAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_viewer_can_list_projects_but_cannot_create_project(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $viewer = User::factory()->create();
        $organization->users()->attach($viewer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $viewer->assignRole('viewer');

        Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        Sanctum::actingAs($viewer);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/projects')
            ->assertOk();

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/projects', [
                'name' => 'Unauthorized Project',
                'code' => 'UP-01',
            ])
            ->assertForbidden();
    }
}

