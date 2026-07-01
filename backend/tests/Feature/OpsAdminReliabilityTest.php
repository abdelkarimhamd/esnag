<?php

namespace Tests\Feature;

use App\Models\ExportJob;
use App\Models\MobileSyncOperationLog;
use App\Models\OnboardingTourProgress;
use App\Models\OpsHealthEvent;
use App\Models\Organization;
use App\Models\OrganizationFeatureFlag;
use App\Models\OrganizationUsageLimit;
use App\Models\Project;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class OpsAdminReliabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_project_level_feature_flag_can_disable_module_routes(): void
    {
        [$organization, $admin] = $this->bootstrapOrganizationWithAdmin();

        $project = Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        OrganizationFeatureFlag::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'feature_key' => 'inspections',
            'is_enabled' => false,
            'updated_by' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/inspections/templates?project_id='.$project->id)
            ->assertStatus(403)
            ->assertJsonPath('message', 'Feature "inspections" is disabled for this scope.');
    }

    public function test_export_request_is_rejected_when_daily_limit_is_reached(): void
    {
        [$organization, $admin] = $this->bootstrapOrganizationWithAdmin();

        OrganizationUsageLimit::query()->create([
            'organization_id' => $organization->id,
            'storage_quota_mb' => 5120,
            'max_exports_per_day' => 1,
            'max_users' => 250,
            'updated_by' => $admin->id,
        ]);

        ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $admin->id,
            'project_id' => null,
            'type' => 'csv',
            'status' => 'completed',
            'filters' => null,
            'file_name' => 'seed.csv',
            'file_path' => 'seed/ops-limit.csv',
            'mime_type' => 'text/csv',
            'download_token' => bin2hex(random_bytes(16)),
            'error_message' => null,
            'completed_at' => Carbon::now(),
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/exports', [
                'type' => 'csv',
            ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('Export limit reached for today', (string) $response->json('errors.exports.0'));
    }

    public function test_support_tools_can_manage_invites_mfa_and_onboarding_state(): void
    {
        [$organization, $admin, $member] = $this->bootstrapOrganizationWithAdmin();

        $member->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => 'seed-secret',
            'mfa_recovery_codes' => ['code-1', 'code-2'],
            'mfa_reset_at' => null,
        ])->save();

        OnboardingTourProgress::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'tour_key' => 'core',
            'current_step' => 4,
            'last_viewed_at' => Carbon::now()->subDay(),
            'completed_at' => Carbon::now()->subDay(),
            'skipped_at' => null,
            'meta' => ['seeded' => true],
        ]);

        Sanctum::actingAs($admin);

        $createInviteResponse = $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson('/api/ops/support/invites', [
                'email' => 'ops.invite.demo@example.test',
                'expires_in_days' => 5,
            ])
            ->assertCreated();

        $inviteId = (int) $createInviteResponse->json('data.id');

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/ops/support/invites/{$inviteId}/resend")
            ->assertOk()
            ->assertJsonPath('data.send_count', 2);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/ops/support/users/{$member->id}/reset-mfa")
            ->assertOk()
            ->assertJsonPath('data.mfa_enabled', false);

        $this->assertDatabaseHas('users', [
            'id' => $member->id,
            'mfa_enabled' => false,
        ]);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/ops/support/users/{$member->id}/reset-onboarding", [
                'tour_key' => 'core',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_tours', 1);

        $this->assertDatabaseHas('onboarding_tour_progresses', [
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'tour_key' => 'core',
            'current_step' => 0,
        ]);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->postJson("/api/ops/support/users/{$member->id}/replay-tours", [
                'tour_keys' => ['core', 'exports'],
            ])
            ->assertOk();

        $this->assertDatabaseHas('onboarding_tour_progresses', [
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'tour_key' => 'exports',
            'current_step' => 0,
        ]);
    }

    public function test_health_endpoint_returns_sync_queue_and_storage_metrics(): void
    {
        [$organization, $admin] = $this->bootstrapOrganizationWithAdmin();

        MobileSyncOperationLog::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $admin->id,
            'op_id' => 'op-1',
            'operation_type' => 'snag.create',
            'status' => 'applied',
            'source' => 'apply',
            'error_code' => null,
            'error_message' => null,
            'payload' => null,
            'occurred_at' => Carbon::now()->subHour(),
        ]);

        MobileSyncOperationLog::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $admin->id,
            'op_id' => 'op-2',
            'operation_type' => 'snag.update',
            'status' => 'failed',
            'source' => 'apply',
            'error_code' => 'sync_error',
            'error_message' => 'Simulated failure',
            'payload' => null,
            'occurred_at' => Carbon::now()->subHour(),
        ]);

        MobileSyncOperationLog::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $admin->id,
            'op_id' => 'op-3',
            'operation_type' => 'snag.comment.create',
            'status' => 'applied',
            'source' => 'apply',
            'error_code' => null,
            'error_message' => null,
            'payload' => null,
            'occurred_at' => Carbon::now()->subHour(),
        ]);

        OpsHealthEvent::query()->create([
            'organization_id' => $organization->id,
            'event_type' => 'storage_failure',
            'severity' => 'error',
            'source' => 'snag_attachment',
            'message' => 'Storage write failed',
            'context' => ['test' => true],
            'occurred_at' => Carbon::now()->subHours(2),
        ]);

        // API latency samples now cover ALL api requests (not just slow ones), so
        // request_error_rate / p95_api_latency_ms are computed over these and are no
        // longer conflated with the mobile-sync error rate. 8 samples, 1 errored (>=400)
        // => request_error_rate 12.5; sorted durations p95 (index 7) => 900.
        foreach ([
            ['duration_ms' => 50, 'status_code' => 200],
            ['duration_ms' => 60, 'status_code' => 200],
            ['duration_ms' => 70, 'status_code' => 200],
            ['duration_ms' => 80, 'status_code' => 204],
            ['duration_ms' => 90, 'status_code' => 200],
            ['duration_ms' => 100, 'status_code' => 200],
            ['duration_ms' => 150, 'status_code' => 200],
            ['duration_ms' => 900, 'status_code' => 500],
        ] as $sample) {
            OpsHealthEvent::query()->create([
                'organization_id' => $organization->id,
                'event_type' => 'api_latency_sample',
                'severity' => $sample['status_code'] >= 500 ? 'error' : 'info',
                'source' => 'api',
                'message' => 'API latency sample for api/projects',
                'context' => [
                    'duration_ms' => $sample['duration_ms'],
                    'status_code' => $sample['status_code'],
                    'path' => 'api/projects',
                    'request_id' => null,
                    'threshold_ms' => 800,
                ],
                'occurred_at' => Carbon::now()->subHour(),
            ]);
        }

        Sanctum::actingAs($admin);

        $this->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/ops/health?window_hours=24')
            ->assertOk()
            ->assertJsonPath('data.sync.total_operations', 3)
            ->assertJsonPath('data.sync.error_operations', 1)
            ->assertJsonPath('data.sync.retry_rate_percent', 0)
            ->assertJsonPath('data.request_error_rate', 12.5)
            ->assertJsonPath('data.p95_api_latency_ms', 900)
            ->assertJsonPath('data.sync_retry_rate', 0)
            ->assertJsonPath('data.websocket_delivery_failures_last_24h', 0)
            ->assertJsonPath('data.storage_failures.ops_events_last_24h', 1)
            ->assertJsonStructure([
                'data' => [
                    'p95_api_latency_ms',
                    'queue_depth' => [
                        'framework_jobs',
                        'framework_failed_jobs_last_24h',
                        'exports_pending',
                        'exports_failed_last_24h',
                    ],
                ],
            ]);
    }

    /**
     * @return array{Organization, User, User}
     */
    private function bootstrapOrganizationWithAdmin(): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $admin = User::factory()->create();
        $member = User::factory()->create();

        $organization->users()->attach($admin->id, ['is_active' => true]);
        $organization->users()->attach($member->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $admin->assignRole('org_admin');
        $member->assignRole('engineer');

        return [$organization, $admin, $member];
    }
}
