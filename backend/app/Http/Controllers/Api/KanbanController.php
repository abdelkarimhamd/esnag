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

        if ($requestedProjectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organization->id, $requestedProjectId, 'kanban.view')
                || ! $this->accessControlService->allows($user, $organization->id, $requestedProjectId, 'snags.view')
            ) {
                abort(403);
            }
        } elseif (
            ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'kanban.view')
            || ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'snags.view')
        ) {
            $kanbanProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'kanban.view');
            $snagProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'snags.view');
            $allowedProjectIds = array_values(array_intersect($kanbanProjects, $snagProjects));

            if ($allowedProjectIds === []) {
                abort(403);
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
            ],
        ]);
    }
}
