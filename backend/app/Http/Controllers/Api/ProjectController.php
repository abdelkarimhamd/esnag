<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
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
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $canViewAll = $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'projects.view');
        $scopedProjectIds = $canViewAll
            ? []
            : $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'projects.view');

        if (! $canViewAll && $scopedProjectIds === []) {
            abort(403);
        }

        $query = Project::query()
            ->where('organization_id', $organization->id)
            ->withCount(['drawings', 'snags']);

        if (! $canViewAll) {
            $query->whereIn('id', $scopedProjectIds);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        $projects = $query
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json($projects);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Project::class);

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'max:50'],
            'is_training' => ['sometimes', 'boolean'],
            'training_locked' => ['sometimes', 'boolean'],
            'training_notes' => ['nullable', 'string'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);

        $project = Project::create([
            ...$validated,
            'organization_id' => $organization->id,
            'status' => $validated['status'] ?? 'active',
            'is_training' => $validated['is_training'] ?? false,
            'training_locked' => $validated['training_locked'] ?? false,
        ]);

        return response()->json([
            'data' => $project,
        ], 201);
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        $this->assertOrganization($project->organization_id, $request);
        $this->authorize('view', $project);

        $project->load([
            'buildings.floors.locations',
            'drawings.currentRevision',
        ]);

        return response()->json([
            'data' => $project,
        ]);
    }

    public function dashboard(Request $request, Project $project): JsonResponse
    {
        $this->assertOrganization($project->organization_id, $request);
        $this->authorize('view', $project);

        $statusCounts = $project->snags()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => [
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                    'is_training' => (bool) $project->is_training,
                    'training_locked' => (bool) $project->training_locked,
                ],
                'summary' => [
                    'snags_total' => $project->snags()->count(),
                    'drawings_total' => $project->drawings()->count(),
                    'open_snags' => $project->snags()->whereNotIn('status', ['closed', 'rejected'])->count(),
                    'status_breakdown' => $statusCounts,
                ],
            ],
        ]);
    }
}

