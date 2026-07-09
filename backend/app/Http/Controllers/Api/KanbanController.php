<?php

namespace App\Http\Controllers\Api;

use App\Enums\SnagStatus;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Snag;
use App\Services\AccessControlService;
use App\Support\SnagWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class KanbanController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $user = $request->user();
        $requestedProjectId = $request->integer('project_id') ?: null;
        $scope = $request->string('scope')->toString() === 'mine' ? 'mine' : 'all';
        $dueWindow = $request->string('due_window')->toString();
        if (! in_array($dueWindow, ['all', 'overdue', '7d'], true)) {
            $dueWindow = 'all';
        }

        if ($requestedProjectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organization->id, $requestedProjectId, 'kanban.view')
                || ! $this->accessControlService->allows($user, $organization->id, $requestedProjectId, 'snags.view')
            ) {
                $this->denyWithPermissions($request, ['kanban.view', 'snags.view'], 'You do not have permission to view the board for this project.');
            }
        } elseif (
            ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'kanban.view')
            || ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'snags.view')
        ) {
            $kanbanProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'kanban.view');
            $snagProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'snags.view');
            $allowedProjectIds = array_values(array_intersect($kanbanProjects, $snagProjects));

            if ($allowedProjectIds === []) {
                $this->denyWithPermissions($request, ['kanban.view', 'snags.view'], 'You do not have permission to view any board in this organization.');
            }

            $request->merge(['_allowed_project_ids' => $allowedProjectIds]);
        }

        $query = Snag::query()
            ->where('organization_id', $organization->id)
            ->with([
                'project:id,name,code',
                'assignee:id,name,email',
                'creator:id,name,email',
                'closeoutInstance:id,snag_id,completion_percentage,status',
            ])
            ->orderBy('due_date')
            ->orderByDesc('created_at');

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        } elseif ($allowedProjectIds = $request->input('_allowed_project_ids')) {
            $query->whereIn('project_id', is_array($allowedProjectIds) ? $allowedProjectIds : []);
        }

        if ($priority = $request->string('priority')->toString()) {
            $query->where('priority', $priority);
        }

        if ($assignedTo = $request->integer('assigned_to')) {
            $query->where('assigned_to', $assignedTo);
        }

        if ($scope === 'mine') {
            $query->where('assigned_to', $user->id);
        }

        if ($dueWindow === 'overdue') {
            $query->whereNotNull('due_date')
                ->whereDate('due_date', '<', Carbon::today())
                ->whereNotIn('status', [SnagStatus::Closed->value, SnagStatus::Rejected->value]);
        }

        if ($dueWindow === '7d') {
            $query->whereNotNull('due_date')
                ->whereBetween('due_date', [Carbon::today(), Carbon::today()->copy()->addDays(7)->endOfDay()])
                ->whereNotIn('status', [SnagStatus::Closed->value, SnagStatus::Rejected->value]);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('reference', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%");
            });
        }

        $snags = $query->get();

        $columns = collect(SnagStatus::labels())
            ->map(function (string $label, string $status) use ($snags) {
                $statusSnags = $snags->where('status', $status)->values();

                return [
                    'status' => $status,
                    'label' => $label,
                    'total' => $statusSnags->count(),
                    'snags' => $statusSnags,
                ];
            })
            ->values();

        return response()->json([
            'data' => [
                'columns' => $columns,
                'workflow' => SnagWorkflow::transitions(),
                'filters' => [
                    'scope' => $scope,
                    'due_window' => $dueWindow,
                    'project_id' => $requestedProjectId,
                ],
            ],
        ]);
    }
}
