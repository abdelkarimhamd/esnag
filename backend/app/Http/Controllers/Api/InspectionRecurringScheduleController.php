<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionTemplate;
use App\Models\Project;
use App\Models\User;
use App\Services\AccessControlService;
use App\Services\InspectionRecurringScheduleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InspectionRecurringScheduleController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
        private readonly InspectionRecurringScheduleService $recurringScheduleService,
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
            abort(403, 'You do not have permission to view recurring schedules.');
        }

        $query = InspectionRecurringSchedule::query()
            ->where('organization_id', $organization->id)
            ->when($projectId, fn ($builder) => $builder->where('project_id', $projectId))
            ->with([
                'project:id,name,code',
                'template:id,name,type,project_id',
                'assignee:id,name,email',
                'creator:id,name,email',
                'updater:id,name,email',
            ])
            ->withCount('runs');

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $schedules = $query
            ->orderByDesc('is_active')
            ->orderBy('next_run_at')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $schedules,
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
            abort(403, 'You do not have permission to manage recurring schedules.');
        }

        $template = InspectionTemplate::query()->findOrFail((int) $validated['inspection_template_id']);
        $this->assertOrganization($template->organization_id, $request);

        $this->assertTemplateFitsProject($template, $projectId);
        $this->assertAssignee($organization->id, $validated['assign_to_user_id'] ?? null);

        $startsAt = Carbon::parse($validated['starts_at']);
        $nextRunAt = $this->recurringScheduleService->calculateInitialNextRunAt(
            $validated['recurrence'],
            (int) ($validated['interval_value'] ?? 1),
            $startsAt,
            $validated['run_time'] ?? '08:00',
            $validated['timezone'] ?? 'UTC',
        );

        $schedule = InspectionRecurringSchedule::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $projectId,
            'inspection_template_id' => $template->id,
            'name' => $validated['name'],
            'recurrence' => $validated['recurrence'],
            'interval_value' => (int) ($validated['interval_value'] ?? 1),
            'starts_at' => $startsAt,
            'ends_at' => ! empty($validated['ends_at']) ? Carbon::parse($validated['ends_at']) : null,
            'next_run_at' => $nextRunAt,
            'run_time' => $validated['run_time'] ?? '08:00',
            'timezone' => $validated['timezone'] ?? 'UTC',
            'default_form_data' => $validated['default_form_data'] ?? null,
            'assign_to_user_id' => $validated['assign_to_user_id'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $schedule->load([
                'project:id,name,code',
                'template:id,name,type,project_id',
                'assignee:id,name,email',
                'creator:id,name,email',
                'updater:id,name,email',
            ]),
        ], 201);
    }

    public function update(Request $request, InspectionRecurringSchedule $inspectionRecurringSchedule): JsonResponse
    {
        $this->assertOrganization($inspectionRecurringSchedule->organization_id, $request);

        if (! $this->canManage($request, $inspectionRecurringSchedule->organization_id, $inspectionRecurringSchedule->project_id)) {
            abort(403, 'You do not have permission to manage recurring schedules.');
        }

        $validated = $this->validatePayload($request, partial: true);

        $projectId = array_key_exists('project_id', $validated)
            ? ($validated['project_id'] ?: null)
            : $inspectionRecurringSchedule->project_id;

        if ($projectId) {
            $project = Project::query()->findOrFail($projectId);
            $this->assertOrganization($project->organization_id, $request);
        }

        $templateId = array_key_exists('inspection_template_id', $validated)
            ? (int) $validated['inspection_template_id']
            : $inspectionRecurringSchedule->inspection_template_id;

        $template = InspectionTemplate::query()->findOrFail($templateId);
        $this->assertOrganization($template->organization_id, $request);

        $this->assertTemplateFitsProject($template, $projectId);
        $this->assertAssignee(
            $inspectionRecurringSchedule->organization_id,
            array_key_exists('assign_to_user_id', $validated)
                ? ($validated['assign_to_user_id'] ?: null)
                : $inspectionRecurringSchedule->assign_to_user_id,
        );

        $startsAt = array_key_exists('starts_at', $validated)
            ? Carbon::parse($validated['starts_at'])
            : Carbon::parse($inspectionRecurringSchedule->starts_at);

        $recurrence = $validated['recurrence'] ?? $inspectionRecurringSchedule->recurrence;
        $intervalValue = (int) ($validated['interval_value'] ?? $inspectionRecurringSchedule->interval_value);
        $runTime = $validated['run_time'] ?? $inspectionRecurringSchedule->run_time;
        $timezone = $validated['timezone'] ?? $inspectionRecurringSchedule->timezone;

        $shouldRebuildNextRun = array_intersect(
            ['starts_at', 'recurrence', 'interval_value', 'run_time', 'timezone'],
            array_keys($validated)
        ) !== [];

        $nextRunAt = $shouldRebuildNextRun
            ? $this->recurringScheduleService->calculateInitialNextRunAt(
                $recurrence,
                $intervalValue,
                $startsAt,
                $runTime,
                $timezone,
            )
            : $inspectionRecurringSchedule->next_run_at;

        $inspectionRecurringSchedule->fill([
            'project_id' => $projectId,
            'inspection_template_id' => $template->id,
            'name' => $validated['name'] ?? $inspectionRecurringSchedule->name,
            'recurrence' => $recurrence,
            'interval_value' => $intervalValue,
            'starts_at' => $startsAt,
            'ends_at' => array_key_exists('ends_at', $validated)
                ? (! empty($validated['ends_at']) ? Carbon::parse($validated['ends_at']) : null)
                : $inspectionRecurringSchedule->ends_at,
            'next_run_at' => $nextRunAt,
            'run_time' => $runTime,
            'timezone' => $timezone,
            'default_form_data' => array_key_exists('default_form_data', $validated)
                ? $validated['default_form_data']
                : $inspectionRecurringSchedule->default_form_data,
            'assign_to_user_id' => array_key_exists('assign_to_user_id', $validated)
                ? ($validated['assign_to_user_id'] ?: null)
                : $inspectionRecurringSchedule->assign_to_user_id,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : $inspectionRecurringSchedule->is_active,
            'updated_by' => $request->user()->id,
        ]);
        $inspectionRecurringSchedule->save();

        return response()->json([
            'data' => $inspectionRecurringSchedule->fresh([
                'project:id,name,code',
                'template:id,name,type,project_id',
                'assignee:id,name,email',
                'creator:id,name,email',
                'updater:id,name,email',
            ]),
        ]);
    }

    public function destroy(Request $request, InspectionRecurringSchedule $inspectionRecurringSchedule): JsonResponse
    {
        $this->assertOrganization($inspectionRecurringSchedule->organization_id, $request);

        if (! $this->canManage($request, $inspectionRecurringSchedule->organization_id, $inspectionRecurringSchedule->project_id)) {
            abort(403, 'You do not have permission to manage recurring schedules.');
        }

        $inspectionRecurringSchedule->delete();

        return response()->json([
            'message' => 'Recurring schedule deleted.',
        ]);
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $prefix = $partial ? 'sometimes|' : '';

        return $request->validate([
            'project_id' => [$prefix.'nullable', 'integer', 'exists:projects,id'],
            'inspection_template_id' => [$prefix.'required', 'integer', 'exists:inspection_templates,id'],
            'name' => [$prefix.'required', 'string', 'max:180'],
            'recurrence' => [
                $prefix.'required',
                Rule::in([
                    InspectionRecurringSchedule::RECURRENCE_DAILY,
                    InspectionRecurringSchedule::RECURRENCE_WEEKLY,
                    InspectionRecurringSchedule::RECURRENCE_BIWEEKLY,
                    InspectionRecurringSchedule::RECURRENCE_MONTHLY,
                ]),
            ],
            'interval_value' => [$prefix.'sometimes', 'integer', 'min:1', 'max:24'],
            'starts_at' => [$prefix.'required', 'date'],
            'ends_at' => [$prefix.'nullable', 'date', 'after:starts_at'],
            'run_time' => [$prefix.'sometimes', 'regex:/^\d{2}:\d{2}$/'],
            'timezone' => [$prefix.'sometimes', 'string', 'max:80'],
            'default_form_data' => [$prefix.'nullable', 'array'],
            'assign_to_user_id' => [$prefix.'nullable', 'integer', 'exists:users,id'],
            'is_active' => [$prefix.'sometimes', 'boolean'],
        ]);
    }

    private function assertTemplateFitsProject(InspectionTemplate $template, ?int $projectId): void
    {
        if ($template->project_id !== null && $projectId !== null && $template->project_id !== $projectId) {
            throw ValidationException::withMessages([
                'inspection_template_id' => ['Template is bound to a different project.'],
            ]);
        }
    }

    private function assertAssignee(int $organizationId, ?int $assigneeId): void
    {
        if (! $assigneeId) {
            return;
        }

        $assignee = User::query()->findOrFail($assigneeId);
        if (! $assignee->organizations()->where('organizations.id', $organizationId)->exists()) {
            throw ValidationException::withMessages([
                'assign_to_user_id' => ['Assignee is not a member of this organization.'],
            ]);
        }
    }

    private function canView(Request $request, int $organizationId, ?int $projectId): bool
    {
        $user = $request->user();

        if (
            $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.recurring.view')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.recurring.manage')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.templates.view')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.templates.manage')
        ) {
            return true;
        }

        if ($projectId !== null) {
            return false;
        }

        return $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'inspections.recurring.view')
            || $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'inspections.recurring.manage');
    }

    private function canManage(Request $request, int $organizationId, ?int $projectId): bool
    {
        $user = $request->user();

        if (
            $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.recurring.manage')
            || $this->accessControlService->allows($user, $organizationId, $projectId, 'inspections.templates.manage')
        ) {
            return true;
        }

        if ($projectId !== null) {
            return false;
        }

        return $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'inspections.recurring.manage')
            || $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'inspections.templates.manage');
    }
}
