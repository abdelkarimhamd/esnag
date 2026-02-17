<?php

namespace App\Http\Controllers\Api;

use App\Enums\SnagStatus;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\SnagReminderPolicy;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SnagReminderPolicyController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $projectId = $request->filled('project_id') ? $request->integer('project_id') : null;

        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        if (! $this->canView($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to view reminder policies.');
        }

        $policies = SnagReminderPolicy::query()
            ->where('organization_id', $organization->id)
            ->when($projectId, fn ($query) => $query->where('project_id', $projectId))
            ->with(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email'])
            ->withCount('logs')
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $policies,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $validated = $this->validatePayload($request);

        $projectId = $validated['project_id'] ?? null;
        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        if (! $this->canManage($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to manage reminder policies.');
        }

        $policy = SnagReminderPolicy::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $projectId,
            'name' => $validated['name'],
            'statuses' => $validated['statuses'] ?? [
                SnagStatus::Assigned->value,
                SnagStatus::InProgress->value,
                SnagStatus::ReadyForReview->value,
            ],
            'reminder_every_hours' => (int) ($validated['reminder_every_hours'] ?? 24),
            'max_reminders' => (int) ($validated['max_reminders'] ?? 10),
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $policy->load(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ], 201);
    }

    public function update(Request $request, SnagReminderPolicy $snagReminderPolicy): JsonResponse
    {
        $this->assertOrganization($snagReminderPolicy->organization_id, $request);

        if (! $this->canManage($request, $snagReminderPolicy->organization_id, $snagReminderPolicy->project_id)) {
            abort(403, 'You do not have permission to manage reminder policies.');
        }

        $validated = $this->validatePayload($request, partial: true);

        if (array_key_exists('project_id', $validated) && $validated['project_id']) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $snagReminderPolicy->fill([
            'project_id' => array_key_exists('project_id', $validated)
                ? ($validated['project_id'] ?: null)
                : $snagReminderPolicy->project_id,
            'name' => $validated['name'] ?? $snagReminderPolicy->name,
            'statuses' => array_key_exists('statuses', $validated)
                ? $validated['statuses']
                : $snagReminderPolicy->statuses,
            'reminder_every_hours' => array_key_exists('reminder_every_hours', $validated)
                ? (int) $validated['reminder_every_hours']
                : $snagReminderPolicy->reminder_every_hours,
            'max_reminders' => array_key_exists('max_reminders', $validated)
                ? (int) $validated['max_reminders']
                : $snagReminderPolicy->max_reminders,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : $snagReminderPolicy->is_active,
            'updated_by' => $request->user()->id,
        ]);
        $snagReminderPolicy->save();

        return response()->json([
            'data' => $snagReminderPolicy->fresh(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ]);
    }

    public function destroy(Request $request, SnagReminderPolicy $snagReminderPolicy): JsonResponse
    {
        $this->assertOrganization($snagReminderPolicy->organization_id, $request);

        if (! $this->canManage($request, $snagReminderPolicy->organization_id, $snagReminderPolicy->project_id)) {
            abort(403, 'You do not have permission to manage reminder policies.');
        }

        $snagReminderPolicy->delete();

        return response()->json([
            'message' => 'Reminder policy deleted.',
        ]);
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $prefix = $partial ? 'sometimes|' : '';
        $statuses = array_map(
            static fn (SnagStatus $status): string => $status->value,
            SnagStatus::cases()
        );

        return $request->validate([
            'project_id' => [$prefix.'nullable', 'integer', 'exists:projects,id'],
            'name' => [$prefix.'required', 'string', 'max:180'],
            'statuses' => [$prefix.'nullable', 'array', 'min:1'],
            'statuses.*' => ['required_with:statuses', 'string', Rule::in($statuses)],
            'reminder_every_hours' => [$prefix.'sometimes', 'integer', 'min:1', 'max:720'],
            'max_reminders' => [$prefix.'sometimes', 'integer', 'min:1', 'max:250'],
            'is_active' => [$prefix.'sometimes', 'boolean'],
        ]);
    }

    private function canView(Request $request, int $organizationId, ?int $projectId): bool
    {
        $user = $request->user();

        if (
            $this->accessControlService->allows($user, $organizationId, $projectId, 'automation.view')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'automation.manage')
        ) {
            return true;
        }

        if ($projectId !== null) {
            return false;
        }

        return $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'automation.view')
            || $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'automation.manage');
    }

    private function canManage(Request $request, int $organizationId, ?int $projectId): bool
    {
        $user = $request->user();

        if ($this->accessControlService->allows($user, $organizationId, $projectId, 'automation.manage')) {
            return true;
        }

        if ($projectId !== null) {
            return false;
        }

        return $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'automation.manage');
    }
}
