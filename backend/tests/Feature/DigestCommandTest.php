<?php

namespace Tests\Feature;

use App\Enums\SnagStatus;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\NotificationPreference;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use App\Notifications\DigestSummaryNotification;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

use function setPermissionsTeamId;

class DigestCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_daily_digest_command_honors_user_preferences(): void
    {
        Notification::fake();

        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $manager = User::factory()->create();
        $engineer = User::factory()->create();

        $organization->users()->attach($manager->id, ['is_active' => true]);
        $organization->users()->attach($engineer->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $manager->assignRole('project_manager');
        $engineer->assignRole('engineer');

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

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

        Snag::factory()->count(3)->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'assigned_to' => $manager->id,
            'created_by' => $engineer->id,
            'status' => SnagStatus::Assigned->value,
        ]);

        NotificationPreference::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $manager->id,
            'digest_frequency' => 'daily',
            'email_enabled' => true,
            'in_app_enabled' => true,
            'push_enabled' => false,
            'timezone' => 'UTC',
        ]);

        NotificationPreference::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $engineer->id,
            'digest_frequency' => 'weekly',
            'email_enabled' => true,
            'in_app_enabled' => true,
            'push_enabled' => false,
            'timezone' => 'UTC',
        ]);

        $this->artisan('digests:send daily')
            ->assertExitCode(0);

        Notification::assertSentTo($manager, DigestSummaryNotification::class);
        Notification::assertNotSentTo($engineer, DigestSummaryNotification::class);

        $dailyPreference = NotificationPreference::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $manager->id)
            ->firstOrFail();

        $weeklyPreference = NotificationPreference::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $engineer->id)
            ->firstOrFail();

        $this->assertNotNull($dailyPreference->last_daily_sent_at);
        $this->assertNull($weeklyPreference->last_daily_sent_at);
    }
}
