<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\Organization;
use App\Models\Project;
use App\Models\RootCauseCategory;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class DashboardAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_kpis_include_sla_pareto_cost_and_forecast_metrics(): void
    {
        [$organization, $project, $users] = $this->bootstrapContext();

        $rootCauseA = RootCauseCategory::query()->create([
            'organization_id' => $organization->id,
            'name' => 'Installation Error',
            'code' => 'RC-INSTALL',
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
        ]);

        $rootCauseB = RootCauseCategory::query()->create([
            'organization_id' => $organization->id,
            'name' => 'Material Defect',
            'code' => 'RC-MATERIAL',
            'is_active' => true,
            'created_by' => $users['project_manager']->id,
        ]);

        $baseCreated = now()->subDays(6);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $this->drawingIdForProject($organization, $project),
            'reference' => 'SNG-10001',
            'status' => SnagStatus::Assigned->value,
            'created_by' => $users['project_manager']->id,
            'assigned_to' => $users['engineer']->id,
            'root_cause_category_id' => $rootCauseA->id,
            'estimated_cost' => 1500,
            'estimated_hours' => 12,
            'acknowledged_at' => $baseCreated->copy()->addHours(4),
            'created_at' => $baseCreated,
            'updated_at' => $baseCreated,
        ]);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $this->drawingIdForProject($organization, $project),
            'reference' => 'SNG-10002',
            'status' => SnagStatus::InProgress->value,
            'created_by' => $users['project_manager']->id,
            'assigned_to' => $users['engineer']->id,
            'root_cause_category_id' => $rootCauseA->id,
            'estimated_cost' => 2200,
            'estimated_hours' => 18,
            'acknowledged_at' => $baseCreated->copy()->addHours(3),
            'started_at' => $baseCreated->copy()->addHours(8),
            'created_at' => $baseCreated->copy()->addDay(),
            'updated_at' => $baseCreated->copy()->addDay(),
        ]);

        Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $this->drawingIdForProject($organization, $project),
            'reference' => 'SNG-10003',
            'status' => SnagStatus::Closed->value,
            'created_by' => $users['project_manager']->id,
            'assigned_to' => $users['engineer']->id,
            'root_cause_category_id' => $rootCauseB->id,
            'estimated_cost' => 3200,
            'estimated_hours' => 20,
            'acknowledged_at' => $baseCreated->copy()->addHours(2),
            'started_at' => $baseCreated->copy()->addHours(6),
            'ready_for_review_at' => $baseCreated->copy()->addHours(28),
            'closed_at' => $baseCreated->copy()->addHours(44),
            'created_at' => $baseCreated->copy()->addDays(2),
            'updated_at' => $baseCreated->copy()->addDays(2),
        ]);

        Sanctum::actingAs($users['project_manager']);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/dashboard/kpis?project_id='.$project->id)
            ->assertOk();

        $response
            ->assertJsonStructure([
                'data' => [
                    'summary',
                    'sla' => [
                        'thresholds',
                        'averages',
                        'compliance',
                    ],
                    'root_cause_pareto',
                    'cost_impact' => [
                        'summary',
                        'by_trade',
                        'by_stakeholder',
                    ],
                    'forecast' => [
                        'overall' => ['history', 'projected', 'trend_slope', 'current_open', 'projected_open_end'],
                        'by_trade',
                        'by_stakeholder',
                    ],
                ],
            ])
            ->assertJsonPath('data.summary.total_snags', 3)
            ->assertJsonPath('data.summary.open_snags', 2)
            ->assertJsonPath('data.cost_impact.summary.estimated_cost_total', 6900)
            ->assertJsonPath('data.sla.compliance.ack_measured', 3);
    }

    public function test_dashboard_configs_can_be_created_updated_and_deleted(): void
    {
        [$organization, $project, $users] = $this->bootstrapContext();

        Sanctum::actingAs($users['project_manager']);

        $create = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/dashboard/configs', [
                'name' => 'SLA Focus',
                'is_default' => true,
                'cards' => ['open_snags', 'avg_ack_hours', 'avg_fix_hours'],
                'filters' => [
                    'status' => ['assigned', 'in_progress'],
                    'priority' => ['high', 'critical'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'SLA Focus');

        $configId = (int) $create->json('data.id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/dashboard/configs')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->putJson("/api/dashboard/configs/{$configId}", [
                'name' => 'SLA and Cost Focus',
                'cards' => ['open_snags', 'avg_ack_hours', 'cost_total'],
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'SLA and Cost Focus');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->deleteJson("/api/dashboard/configs/{$configId}")
            ->assertOk();

        $this->assertDatabaseMissing('dashboard_configs', [
            'id' => $configId,
        ]);
    }

    /**
     * @return array{0: Organization, 1: Project, 2: array<string, User>}
     */
    private function bootstrapContext(): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $users = [
            'project_manager' => User::factory()->create(),
            'engineer' => User::factory()->create(),
        ];

        foreach ($users as $user) {
            $organization->users()->attach($user->id, ['is_active' => true]);
        }

        setPermissionsTeamId($organization->id);
        $users['project_manager']->assignRole('project_manager');
        $users['engineer']->assignRole('engineer');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        return [$organization, $project, $users];
    }

    private function drawingIdForProject(Organization $organization, Project $project): int
    {
        $building = Building::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
        ]);

        $floor = Floor::factory()->create([
            'organization_id' => $organization->id,
            'building_id' => $building->id,
        ]);

        $drawing = Drawing::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
        ]);

        return $drawing->id;
    }
}

