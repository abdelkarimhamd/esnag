<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Models\WorkflowAutomationRule;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkflowAutomationRuleController extends Controller
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

        if (! $this->canViewRules($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to view automation rules.');
        }

        $rules = WorkflowAutomationRule::query()
            ->where('organization_id', $organization->id)
            ->when($projectId, fn ($query) => $query->where('project_id', $projectId))
            ->with(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email'])
            ->withCount('logs')
            ->orderBy('priority')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $rules,
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

        if (! $this->canManageRules($request, $organization->id, $projectId)) {
            abort(403, 'You do not have permission to manage automation rules.');
        }

        $this->assertActionsAreValid($organization->id, $projectId, $validated['actions']);

        $rule = WorkflowAutomationRule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $projectId,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'trigger_event' => $validated['trigger_event'],
            'conditions' => $validated['conditions'] ?? null,
            'actions' => $validated['actions'],
            'priority' => (int) ($validated['priority'] ?? 100),
            'run_once_per_snag' => (bool) ($validated['run_once_per_snag'] ?? false),
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $rule->load(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ], 201);
    }

    public function update(Request $request, WorkflowAutomationRule $workflowAutomationRule): JsonResponse
    {
        $this->assertOrganization($workflowAutomationRule->organization_id, $request);

        if (! $this->canManageRules($request, $workflowAutomationRule->organization_id, $workflowAutomationRule->project_id)) {
            abort(403, 'You do not have permission to manage automation rules.');
        }

        $validated = $this->validatePayload($request, partial: true);

        if (array_key_exists('project_id', $validated) && $validated['project_id']) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $actions = array_key_exists('actions', $validated)
            ? $validated['actions']
            : $workflowAutomationRule->actions;

        $targetProjectId = array_key_exists('project_id', $validated)
            ? ($validated['project_id'] ?: null)
            : $workflowAutomationRule->project_id;

        $this->assertActionsAreValid($workflowAutomationRule->organization_id, $targetProjectId, $actions);

        $workflowAutomationRule->fill([
            'project_id' => $targetProjectId,
            'name' => $validated['name'] ?? $workflowAutomationRule->name,
            'description' => array_key_exists('description', $validated)
                ? $validated['description']
                : $workflowAutomationRule->description,
            'trigger_event' => $validated['trigger_event'] ?? $workflowAutomationRule->trigger_event,
            'conditions' => array_key_exists('conditions', $validated)
                ? $validated['conditions']
                : $workflowAutomationRule->conditions,
            'actions' => $actions,
            'priority' => array_key_exists('priority', $validated)
                ? (int) $validated['priority']
                : $workflowAutomationRule->priority,
            'run_once_per_snag' => array_key_exists('run_once_per_snag', $validated)
                ? (bool) $validated['run_once_per_snag']
                : $workflowAutomationRule->run_once_per_snag,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : $workflowAutomationRule->is_active,
            'updated_by' => $request->user()->id,
        ]);
        $workflowAutomationRule->save();

        return response()->json([
            'data' => $workflowAutomationRule->fresh(['project:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ]);
    }

    public function destroy(Request $request, WorkflowAutomationRule $workflowAutomationRule): JsonResponse
    {
        $this->assertOrganization($workflowAutomationRule->organization_id, $request);

        if (! $this->canManageRules($request, $workflowAutomationRule->organization_id, $workflowAutomationRule->project_id)) {
            abort(403, 'You do not have permission to manage automation rules.');
        }

        $workflowAutomationRule->delete();

        return response()->json([
            'message' => 'Automation rule deleted.',
        ]);
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $prefix = $partial ? 'sometimes|' : '';

        return $request->validate([
            'project_id' => [$prefix.'nullable', 'integer', 'exists:projects,id'],
            'name' => [$prefix.'required', 'string', 'max:180'],
            'description' => [$prefix.'nullable', 'string'],
            'trigger_event' => [
                $prefix.'required',
                Rule::in([
                    WorkflowAutomationRule::TRIGGER_SNAG_CREATED,
                    WorkflowAutomationRule::TRIGGER_SNAG_UPDATED,
                    WorkflowAutomationRule::TRIGGER_SNAG_STATUS_CHANGED,
                ]),
            ],
            'conditions' => [$prefix.'nullable', 'array'],
            'conditions.trade' => ['nullable'],
            'conditions.priority' => ['nullable'],
            'conditions.status' => ['nullable'],
            'conditions.rejection_count_gte' => ['nullable', 'integer', 'min:1', 'max:20'],
            'conditions.status_changed_to' => ['nullable'],
            'actions' => [$prefix.'required', 'array'],
            'actions.assign_company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'actions.assign_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'actions.assign_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'actions.due_in_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'actions.escalate_to_roles' => ['nullable', 'array', 'min:1'],
            'actions.escalate_to_roles.*' => [
                'required_with:actions.escalate_to_roles',
                'string',
                Rule::in(['owner', 'consultant', 'org_admin', 'project_manager']),
            ],
            'priority' => [$prefix.'sometimes', 'integer', 'min:1', 'max:999'],
            'run_once_per_snag' => [$prefix.'sometimes', 'boolean'],
            'is_active' => [$prefix.'sometimes', 'boolean'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $actions
     */
    private function assertActionsAreValid(int $organizationId, ?int $projectId, array $actions): void
    {
        $supportedKeys = [
            'assign_company_id',
            'assign_team_id',
            'assign_user_id',
            'due_in_hours',
            'escalate_to_roles',
        ];

        $hasSupportedAction = collect($supportedKeys)
            ->contains(fn ($key) => Arr::exists($actions, $key) && $actions[$key] !== null && $actions[$key] !== []);

        if (! $hasSupportedAction) {
            throw ValidationException::withMessages([
                'actions' => ['At least one supported action must be configured.'],
            ]);
        }

        if (Arr::exists($actions, 'assign_company_id') && $actions['assign_company_id']) {
            $company = StakeholderCompany::query()->findOrFail((int) $actions['assign_company_id']);
            if ($company->organization_id !== $organizationId) {
                throw ValidationException::withMessages([
                    'actions.assign_company_id' => ['Selected company does not belong to this organization.'],
                ]);
            }
        }

        if (Arr::exists($actions, 'assign_team_id') && $actions['assign_team_id']) {
            $team = StakeholderTeam::query()->findOrFail((int) $actions['assign_team_id']);
            if ($team->organization_id !== $organizationId) {
                throw ValidationException::withMessages([
                    'actions.assign_team_id' => ['Selected team does not belong to this organization.'],
                ]);
            }

            if ($projectId !== null && $team->project_id !== null && $team->project_id !== $projectId) {
                throw ValidationException::withMessages([
                    'actions.assign_team_id' => ['Selected team is not available for this project.'],
                ]);
            }
        }

        if (Arr::exists($actions, 'assign_user_id') && $actions['assign_user_id']) {
            $assignee = User::query()->findOrFail((int) $actions['assign_user_id']);
            if (! $assignee->organizations()->where('organizations.id', $organizationId)->exists()) {
                throw ValidationException::withMessages([
                    'actions.assign_user_id' => ['Selected user is not a member of this organization.'],
                ]);
            }
        }
    }

    private function canViewRules(Request $request, int $organizationId, ?int $projectId): bool
    {
        $user = $request->user();

        if (
            $this->accessControlService->allows($user, $organizationId, $projectId, 'automation.manage')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'automation.view')
        ) {
            return true;
        }

        if ($projectId !== null) {
            return false;
        }

        return $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'automation.view')
            || $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'automation.manage');
    }

    private function canManageRules(Request $request, int $organizationId, ?int $projectId): bool
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
