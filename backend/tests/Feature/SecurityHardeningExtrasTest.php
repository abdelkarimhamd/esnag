<?php

namespace Tests\Feature;

use App\Models\Building;
use App\Models\Drawing;
use App\Models\Floor;
use App\Models\MobileAuthDevice;
use App\Models\Organization;
use App\Models\OrganizationSecuritySetting;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

use function setPermissionsTeamId;

class SecurityHardeningExtrasTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_login_requires_mfa_code_when_tenant_policy_enforces_it(): void
    {
        [$organization, $user] = $this->bootstrapOrganizationMember('viewer');

        OrganizationSecuritySetting::query()->create([
            'organization_id' => $organization->id,
            'mfa_required_web' => true,
            'mfa_required_mobile' => false,
            'mobile_device_trust_days' => 30,
            'enforce_ip_allowlist' => false,
            'ip_allowlist' => [],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_OFF,
        ]);

        $user->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => 'JBSWY3DPEHPK3PXP',
        ])->save();

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])
            ->assertStatus(428)
            ->assertJsonPath('mfa_required', true)
            ->assertJsonPath('mfa_type', 'totp');
    }

    public function test_mobile_login_allows_trusted_device_without_otp_when_mobile_mfa_required(): void
    {
        [$organization, $user] = $this->bootstrapOrganizationMember('engineer');

        OrganizationSecuritySetting::query()->create([
            'organization_id' => $organization->id,
            'mfa_required_web' => false,
            'mfa_required_mobile' => true,
            'mobile_device_trust_days' => 30,
            'enforce_ip_allowlist' => false,
            'ip_allowlist' => [],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_OFF,
        ]);

        $user->forceFill([
            'mfa_enabled' => true,
            'mfa_secret' => 'JBSWY3DPEHPK3PXP',
        ])->save();

        MobileAuthDevice::query()->create([
            'user_id' => $user->id,
            'device_id' => 'trusted-device-1',
            'device_name' => 'QA-iPhone',
            'platform' => 'ios',
            'is_active' => true,
            'trusted_until' => Carbon::now()->addDay(),
        ]);

        $response = $this->postJson('/api/auth/mobile-login', [
            'email' => $user->email,
            'password' => 'password',
            'device_name' => 'QA-iPhone',
            'device_id' => 'trusted-device-1',
            'platform' => 'ios',
            'app_version' => '1.0.0',
        ]);

        $response->assertOk()
            ->assertJsonPath('device_id', 'trusted-device-1')
            ->assertJsonPath('mfa_verified', true)
            ->assertJsonStructure([
                'token',
                'token_type',
                'user' => ['id', 'email'],
            ]);

        $this->assertDatabaseHas('mobile_auth_devices', [
            'user_id' => $user->id,
            'device_id' => 'trusted-device-1',
            'is_active' => true,
        ]);
    }

    public function test_tenant_ip_allowlist_blocks_non_allowlisted_requests_and_allows_permitted_ip(): void
    {
        [$organization, $viewer] = $this->bootstrapOrganizationMember('viewer');

        Project::factory()->create([
            'organization_id' => $organization->id,
        ]);

        OrganizationSecuritySetting::query()->create([
            'organization_id' => $organization->id,
            'mfa_required_web' => false,
            'mfa_required_mobile' => false,
            'mobile_device_trust_days' => 30,
            'enforce_ip_allowlist' => true,
            'ip_allowlist' => ['10.10.0.0/16'],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_OFF,
        ]);

        Sanctum::actingAs($viewer);

        $this->withServerVariables([
            'REMOTE_ADDR' => '192.168.1.22',
        ])->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/projects')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Request IP is not allowlisted for this organization.');

        $this->withServerVariables([
            'REMOTE_ADDR' => '10.10.5.14',
        ])->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/projects')
            ->assertOk();
    }

    public function test_antivirus_enforce_mode_blocks_infected_snag_attachment_uploads(): void
    {
        Storage::fake('public');

        [$organization, $manager, $snag] = $this->bootstrapSnagContext();

        OrganizationSecuritySetting::query()->create([
            'organization_id' => $organization->id,
            'mfa_required_web' => false,
            'mfa_required_mobile' => false,
            'mobile_device_trust_days' => 30,
            'enforce_ip_allowlist' => false,
            'ip_allowlist' => [],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_ENFORCE,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_OFF,
        ]);

        Sanctum::actingAs($manager);

        $infectedImage = UploadedFile::fake()->image('infected.jpg', 640, 480);
        file_put_contents(
            $infectedImage->getRealPath(),
            file_get_contents($infectedImage->getRealPath()).'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
        );

        $this->withHeaders([
            'X-Organization-Id' => (string) $organization->id,
            'Accept' => 'application/json',
        ])
            ->post("/api/snags/{$snag->id}/attachments", [
                'type' => 'photo',
                'file' => $infectedImage,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');

        $this->assertDatabaseMissing('snag_attachments', [
            'snag_id' => $snag->id,
            'file_name' => 'infected.jpg',
        ]);
    }

    public function test_pii_redaction_required_mode_blocks_upload_without_confirmation(): void
    {
        Storage::fake('public');

        [$organization, $manager, $snag] = $this->bootstrapSnagContext();

        OrganizationSecuritySetting::query()->create([
            'organization_id' => $organization->id,
            'mfa_required_web' => false,
            'mfa_required_mobile' => false,
            'mobile_device_trust_days' => 30,
            'enforce_ip_allowlist' => false,
            'ip_allowlist' => [],
            'antivirus_mode' => OrganizationSecuritySetting::ANTIVIRUS_OFF,
            'pii_redaction_mode' => OrganizationSecuritySetting::PII_REDACTION_REQUIRE,
        ]);

        Sanctum::actingAs($manager);

        $this->withHeaders([
            'X-Organization-Id' => (string) $organization->id,
            'Accept' => 'application/json',
        ])
            ->post("/api/snags/{$snag->id}/attachments", [
                'type' => 'photo',
                'file' => UploadedFile::fake()->image('pii-photo.jpg', 640, 480),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('pii_redacted');
    }

    /**
     * @return array{Organization, User}
     */
    private function bootstrapOrganizationMember(string $role): array
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['is_active' => true]);

        setPermissionsTeamId($organization->id);
        $user->assignRole($role);

        return [$organization, $user];
    }

    /**
     * @return array{Organization, User, Snag}
     */
    private function bootstrapSnagContext(): array
    {
        [$organization, $manager] = $this->bootstrapOrganizationMember('project_manager');

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

        $snag = Snag::factory()->create([
            'organization_id' => $organization->id,
            'project_id' => $project->id,
            'drawing_id' => $drawing->id,
            'building_id' => $building->id,
            'floor_id' => $floor->id,
            'created_by' => $manager->id,
        ]);

        return [$organization, $manager, $snag];
    }
}
