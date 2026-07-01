<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiObservabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_error_response_contains_request_id_for_api_requests(): void
    {
        $response = $this->getJson('/api/projects');

        $response->assertStatus(401);
        $response->assertHeader('X-Request-Id');
        $response->assertJsonStructure([
            'message',
            'code',
            'request_id',
        ]);
        $response->assertJsonPath('code', 'unauthorized');
    }

    public function test_incoming_request_id_is_propagated_to_response_header(): void
    {
        $requestId = (string) Str::uuid();

        $response = $this
            ->withHeader('X-Request-Id', $requestId)
            ->getJson('/api/projects');

        $response->assertStatus(401);
        $response->assertHeader('X-Request-Id', $requestId);
        $response->assertJsonPath('request_id', $requestId);
    }

    public function test_validation_error_also_contains_message_and_request_id(): void
    {
        $requestId = (string) Str::uuid();

        $response = $this
            ->withHeader('X-Request-Id', $requestId)
            ->postJson('/api/auth/mobile-login', []);

        $response->assertStatus(422);
        $response->assertHeader('X-Request-Id', $requestId);
        $response->assertJsonStructure([
            'message',
            'code',
            'errors',
            'request_id',
        ]);
        $response->assertJsonPath('request_id', $requestId);
        $response->assertJsonPath('code', 'validation_failed');
    }

    public function test_forbidden_response_includes_required_permissions_when_available(): void
    {
        $organization = Organization::factory()->create();

        (new RbacSeeder())->run();
        RbacSeeder::seedRolesForOrganization($organization);

        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['is_active' => true]);

        Sanctum::actingAs($user);

        $response = $this
            ->withHeader('X-Organization-Id', (string) $organization->id)
            ->getJson('/api/projects');

        $response->assertStatus(403);
        $response->assertJsonPath('code', 'forbidden');
        $response->assertJsonPath('required_permissions.0', 'projects.view');
    }
}
