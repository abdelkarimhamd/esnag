<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\OnboardingTourProgress;
use App\Models\OrganizationInvite;
use App\Models\OrganizationUsageLimit;
use App\Models\Project;
use App\Models\User;
use App\Services\FeatureFlagService;
use App\Services\OrganizationSecurityService;
use App\Services\OpsHealthService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class OpsAdminController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly FeatureFlagService $featureFlagService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
        private readonly OrganizationSecurityService $organizationSecurityService,
    ) {
    }

    public function featureFlags(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.feature_flags.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $projectId = $request->integer('project_id') ?: null;

        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        $catalog = $this->featureFlagService->catalog();
        $resolved = $this->featureFlagService->resolvedFlags($organization->id, $projectId);

        $orgOverrides = $organization->featureFlags()
            ->whereNull('project_id')
            ->get()
            ->keyBy('feature_key');
        $projectOverrides = $projectId
            ? $organization->featureFlags()
                ->where('project_id', $projectId)
                ->get()
                ->keyBy('feature_key')
            : collect();

        $rows = collect($catalog)->map(function (array $details, string $featureKey) use ($resolved, $orgOverrides, $projectOverrides): array {
            $orgRow = $orgOverrides->get($featureKey);
            $projectRow = $projectOverrides->get($featureKey);

            return [
                'feature_key' => $featureKey,
                'label' => $details['label'],
                'description' => $details['description'],
                'default_enabled' => (bool) $details['default_enabled'],
                'resolved_enabled' => (bool) ($resolved[$featureKey] ?? true),
                'organization_override' => $orgRow ? [
                    'id' => $orgRow->id,
                    'is_enabled' => (bool) $orgRow->is_enabled,
                    'updated_at' => optional($orgRow->updated_at)->toISOString(),
                    'updated_by' => $orgRow->updated_by,
                ] : null,
                'project_override' => $projectRow ? [
                    'id' => $projectRow->id,
                    'is_enabled' => (bool) $projectRow->is_enabled,
                    'updated_at' => optional($projectRow->updated_at)->toISOString(),
                    'updated_by' => $projectRow->updated_by,
                ] : null,
            ];
        })->values();

        return response()->json([
            'data' => [
                'organization_id' => $organization->id,
                'project_id' => $projectId,
                'flags' => $rows,
            ],
        ]);
    }

    public function upsertFeatureFlags(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.feature_flags.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'flags' => ['required', 'array', 'min:1'],
            'flags.*.feature_key' => ['required', 'string', 'max:120'],
            'flags.*.is_enabled' => ['required', 'boolean'],
        ]);

        $projectId = $validated['project_id'] ?? null;
        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        $allowedKeys = $this->featureFlagService->keys();
        $invalid = collect($validated['flags'])
            ->pluck('feature_key')
            ->filter(fn ($key) => ! in_array($key, $allowedKeys, true))
            ->values()
            ->all();

        if ($invalid !== []) {
            return response()->json([
                'message' => 'Unknown feature keys provided.',
                'errors' => [
                    'flags' => ['Unknown keys: '.implode(', ', $invalid)],
                ],
            ], 422);
        }

        $map = collect($validated['flags'])
            ->mapWithKeys(fn (array $row) => [$row['feature_key'] => (bool) $row['is_enabled']])
            ->all();

        $rows = $this->featureFlagService->upsertScopeFlags(
            $organization,
            $projectId ? (int) $projectId : null,
            $map,
            $request->user()->id,
        );

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'id' => $row->id,
                'feature_key' => $row->feature_key,
                'project_id' => $row->project_id,
                'is_enabled' => (bool) $row->is_enabled,
                'updated_at' => optional($row->updated_at)->toISOString(),
            ])->values(),
        ]);
    }

    public function usageLimits(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.usage_limits.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $limits = $this->usageLimitService->ensureLimits($organization);
        $usage = $this->usageLimitService->usageSnapshot($organization->id);

        return response()->json([
            'data' => [
                'limits' => $limits,
                'usage' => $usage,
            ],
        ]);
    }

    public function updateUsageLimits(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.usage_limits.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'storage_quota_mb' => ['sometimes', 'integer', 'min:100', 'max:2097152'],
            'max_exports_per_day' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'max_users' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);

        $limits = $this->usageLimitService->ensureLimits($organization, $request->user()->id);
        $limits->fill([
            ...$validated,
            'updated_by' => $request->user()->id,
        ]);
        $limits->save();

        return response()->json([
            'data' => $limits,
        ]);
    }

    public function health(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.health.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $windowHours = max(1, min(168, $request->integer('window_hours', 24)));
        $health = $this->opsHealthService->dashboard($organization, $windowHours);

        return response()->json([
            'data' => $health,
        ]);
    }

    public function securitySettings(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.security.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $settings = $this->organizationSecurityService->ensureSettings($organization);
        $resolved = $this->organizationSecurityService->resolvedSettings($organization);

        return response()->json([
            'data' => [
                'settings' => $settings,
                'resolved' => $resolved,
            ],
        ]);
    }

    public function updateSecuritySettings(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.security.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'mfa_required_web' => ['sometimes', 'boolean'],
            'mfa_required_mobile' => ['sometimes', 'boolean'],
            'mobile_device_trust_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'enforce_ip_allowlist' => ['sometimes', 'boolean'],
            'ip_allowlist' => ['sometimes', 'array', 'max:200'],
            'ip_allowlist.*' => ['string', 'max:120'],
            'antivirus_mode' => ['sometimes', 'in:off,log_only,enforce'],
            'pii_redaction_mode' => ['sometimes', 'in:off,warn,require'],
            'meta' => ['sometimes', 'array'],
        ]);

        $settings = $this->organizationSecurityService->updateSettings(
            $organization,
            $validated,
            $request->user()->id,
        );

        return response()->json([
            'data' => $settings,
        ]);
    }

    public function invites(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = OrganizationInvite::query()
            ->where('organization_id', $organization->id)
            ->with('inviter:id,name,email')
            ->orderByDesc('created_at');

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($search = trim($request->string('search')->toString())) {
            $query->where('email', 'like', "%{$search}%");
        }

        return response()->json($query->paginate($perPage));
    }

    public function createInvite(Request $request): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:90'],
            'meta' => ['nullable', 'array'],
        ]);

        $this->usageLimitService->assertCanCreateInvite($organization);

        $pendingInvite = OrganizationInvite::query()
            ->where('organization_id', $organization->id)
            ->whereRaw('LOWER(email) = ?', [mb_strtolower((string) $validated['email'])])
            ->where('status', 'pending')
            ->first();

        if ($pendingInvite) {
            return response()->json([
                'data' => $pendingInvite->load('inviter:id,name,email'),
            ]);
        }

        $expiresInDays = (int) ($validated['expires_in_days'] ?? 7);
        $now = Carbon::now();

        $invite = OrganizationInvite::query()->create([
            'organization_id' => $organization->id,
            'email' => mb_strtolower((string) $validated['email']),
            'token' => Str::random(64),
            'status' => 'pending',
            'invited_by' => $request->user()->id,
            'invited_at' => $now,
            'last_sent_at' => $now,
            'send_count' => 1,
            'expires_at' => $now->copy()->addDays($expiresInDays),
            'meta' => $validated['meta'] ?? null,
        ]);

        return response()->json([
            'data' => $invite->load('inviter:id,name,email'),
        ], 201);
    }

    public function resendInvite(Request $request, OrganizationInvite $organizationInvite): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        if ($organizationInvite->organization_id !== $organization->id) {
            abort(404);
        }

        if ($organizationInvite->status !== 'pending') {
            abort(422, 'Only pending invites can be resent.');
        }

        $organizationInvite->send_count = (int) $organizationInvite->send_count + 1;
        $organizationInvite->last_sent_at = Carbon::now();
        $organizationInvite->expires_at = Carbon::now()->addDays(7);
        $organizationInvite->save();

        return response()->json([
            'data' => $organizationInvite->fresh('inviter:id,name,email'),
        ]);
    }

    public function resetMfa(Request $request, User $user): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $this->assertActiveOrganizationMember($organization->id, $user);

        $user->forceFill([
            'mfa_enabled' => false,
            'mfa_secret' => null,
            'mfa_recovery_codes' => null,
            'mfa_reset_at' => Carbon::now(),
        ])->save();

        return response()->json([
            'data' => [
                'user_id' => $user->id,
                'mfa_enabled' => false,
                'mfa_reset_at' => optional($user->mfa_reset_at)->toISOString(),
            ],
        ]);
    }

    public function resetOnboarding(Request $request, User $user): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $this->assertActiveOrganizationMember($organization->id, $user);

        $validated = $request->validate([
            'tour_key' => ['nullable', 'string', 'max:100'],
        ]);

        $query = OnboardingTourProgress::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id);

        if (! empty($validated['tour_key'])) {
            $query->where('tour_key', $validated['tour_key']);
        }

        $updated = 0;
        $rows = $query->get();
        foreach ($rows as $row) {
            $meta = is_array($row->meta) ? $row->meta : [];
            $meta['ops_reset_by'] = $request->user()->id;
            $meta['ops_reset_at'] = Carbon::now()->toISOString();

            $row->forceFill([
                'current_step' => 0,
                'completed_at' => null,
                'skipped_at' => null,
                'last_viewed_at' => Carbon::now(),
                'meta' => $meta,
            ])->save();
            $updated++;
        }

        return response()->json([
            'data' => [
                'user_id' => $user->id,
                'updated_tours' => $updated,
            ],
        ]);
    }

    public function replayTours(Request $request, User $user): JsonResponse
    {
        if (! $request->user()->can('ops.support.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $this->assertActiveOrganizationMember($organization->id, $user);

        $validated = $request->validate([
            'tour_keys' => ['required', 'array', 'min:1', 'max:20'],
            'tour_keys.*' => ['string', 'max:100'],
        ]);

        $rows = [];
        foreach ($validated['tour_keys'] as $tourKey) {
            $row = OnboardingTourProgress::query()->firstOrNew([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'tour_key' => $tourKey,
            ]);

            $meta = is_array($row->meta) ? $row->meta : [];
            $meta['replay_requested_by'] = $request->user()->id;
            $meta['replay_requested_at'] = Carbon::now()->toISOString();

            $row->forceFill([
                'current_step' => 0,
                'completed_at' => null,
                'skipped_at' => null,
                'last_viewed_at' => null,
                'meta' => $meta,
            ])->save();

            $rows[] = [
                'tour_key' => $row->tour_key,
                'current_step' => $row->current_step,
                'completed_at' => $row->completed_at,
                'skipped_at' => $row->skipped_at,
            ];
        }

        return response()->json([
            'data' => [
                'user_id' => $user->id,
                'tours' => $rows,
            ],
        ]);
    }

    private function assertActiveOrganizationMember(int $organizationId, User $user): void
    {
        $isMember = $user->organizations()
            ->where('organizations.id', $organizationId)
            ->where('organization_user.is_active', true)
            ->exists();

        if (! $isMember) {
            abort(422, 'Selected user is not an active member of this organization.');
        }
    }
}
