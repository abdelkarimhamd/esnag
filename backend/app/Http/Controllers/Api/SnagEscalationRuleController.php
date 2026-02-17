<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\SnagEscalationRule;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SnagEscalationRuleController extends Controller
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

        if (! $this->canManageRules($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to manage escalation rules.');
        }

        $rules = SnagEscalationRule::query()
            ->where('organization_id', $organization->id)
            ->when($projectId, fn ($query) => $query->where('project_id', $projectId))
            ->with(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email'])
            ->withCount('escalations')
            ->orderByDesc('is_active')
            ->orderBy('project_id')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $rules,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'name' => ['required', 'string', 'max:150'],
            'overdue_days' => ['required', 'integer', 'min:1', 'max:365'],
            'escalate_to_roles' => ['required', 'array', 'min:1'],
            'escalate_to_roles.*' => ['required', 'string', Rule::in(['owner', 'consultant', 'org_admin', 'project_manager'])],
            'cooldown_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $projectId = $validated['project_id'] ?? null;
        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        if (! $this->canManageRules($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to manage escalation rules.');
        }

        $rule = SnagEscalationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $projectId,
            'name' => $validated['name'],
            'overdue_days' => $validated['overdue_days'],
            'escalate_to_roles' => collect($validated['escalate_to_roles'])->map(fn ($role) => strtolower((string) $role))->unique()->values()->all(),
            'cooldown_hours' => $validated['cooldown_hours'] ?? 24,
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $rule->load(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ], 201);
    }

    public function update(Request $request, SnagEscalationRule $snagEscalationRule): JsonResponse
    {
        $this->assertOrganization($snagEscalationRule->organization_id, $request);

        if (! $this->canManageRules($request, $snagEscalationRule->organization_id, $snagEscalationRule->project_id)) {
            abort(403, 'You do not have permission to manage escalation rules.');
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'overdue_days' => ['sometimes', 'required', 'integer', 'min:1', 'max:365'],
            'escalate_to_roles' => ['sometimes', 'required', 'array', 'min:1'],
            'escalate_to_roles.*' => ['required', 'string', Rule::in(['owner', 'consultant', 'org_admin', 'project_manager'])],
            'cooldown_hours' => ['sometimes', 'required', 'integer', 'min:1', 'max:720'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('name', $validated)) {
            $snagEscalationRule->name = $validated['name'];
        }

        if (array_key_exists('overdue_days', $validated)) {
            $snagEscalationRule->overdue_days = (int) $validated['overdue_days'];
        }

        if (array_key_exists('cooldown_hours', $validated)) {
            $snagEscalationRule->cooldown_hours = (int) $validated['cooldown_hours'];
        }

        if (array_key_exists('is_active', $validated)) {
            $snagEscalationRule->is_active = (bool) $validated['is_active'];
        }

        if (array_key_exists('escalate_to_roles', $validated)) {
            $snagEscalationRule->escalate_to_roles = collect($validated['escalate_to_roles'])
                ->map(fn ($role) => strtolower((string) $role))
                ->unique()
                ->values()
                ->all();
        }

        $snagEscalationRule->updated_by = $request->user()->id;
        $snagEscalationRule->save();

        return response()->json([
            'data' => $snagEscalationRule->fresh(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ]);
    }

    public function destroy(Request $request, SnagEscalationRule $snagEscalationRule): JsonResponse
    {
        $this->assertOrganization($snagEscalationRule->organization_id, $request);

        if (! $this->canManageRules($request, $snagEscalationRule->organization_id, $snagEscalationRule->project_id)) {
            abort(403, 'You do not have permission to manage escalation rules.');
        }

        $snagEscalationRule->delete();

        return response()->json([
            'message' => 'Escalation rule deleted.',
        ]);
    }

    private function canManageRules(Request $request, int $organizationId, ?int $projectId): bool
    {
        $orgRoles = $this->accessControlService->effectiveRoleNames($request->user(), $organizationId);
        if (in_array('org_admin', $orgRoles, true) || in_array('owner', $orgRoles, true)) {
            return true;
        }

        return $this->accessControlService->allows($request->user(), $organizationId, $projectId, 'projects.manage');
    }
}

