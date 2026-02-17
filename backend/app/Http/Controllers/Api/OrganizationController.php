<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $organizations = $user->organizations()
            ->wherePivot('is_active', true)
            ->orderBy('organizations.name')
            ->withCount('users')
            ->get(['organizations.id', 'organizations.name', 'organizations.code'])
            ->map(function ($organization) use ($user) {
                return [
                    'id' => $organization->id,
                    'name' => $organization->name,
                    'code' => $organization->code,
                    'users_count' => $organization->users_count,
                    'roles' => $user->roleNamesForOrganization($organization->id),
                    'permissions' => $user->permissionNamesForProject($organization->id),
                    'project_permissions' => $this->accessControlService->projectScopedPermissionNames($user, $organization->id),
                ];
            })
            ->values();

        return response()->json([
            'data' => $organizations,
        ]);
    }

    public function members(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        $project = null;
        if ($projectId = $request->integer('project_id')) {
            $project = Project::query()->findOrFail($projectId);
            if ($project->organization_id !== $organization->id) {
                abort(404);
            }
        }

        $viewer = $request->user();

        $canViewMembers = $project
            ? $this->accessControlService->allows($viewer, $organization->id, $project->id, 'projects.view')
                || $this->accessControlService->allows($viewer, $organization->id, $project->id, 'snags.assign')
            : $viewer->hasPermissionInOrganization($organization->id, 'projects.view')
                || $viewer->hasPermissionInOrganization($organization->id, 'snags.assign')
                || $this->accessControlService->hasAnyProjectScopedPermission($viewer, $organization->id, 'projects.view')
                || $this->accessControlService->hasAnyProjectScopedPermission($viewer, $organization->id, 'snags.assign');

        if (! $canViewMembers) {
            abort(403);
        }

        $members = $organization->users()
            ->wherePivot('is_active', true)
            ->orderBy('users.name')
            ->get(['users.id', 'users.name', 'users.email'])
            ->map(function ($user) use ($organization, $project) {
                $teamsQuery = $user->stakeholderTeams()
                    ->wherePivot('organization_id', $organization->id)
                    ->wherePivot('is_active', true);

                if ($project) {
                    $teamsQuery->where(function ($query) use ($project): void {
                        $query->whereNull('stakeholder_teams.project_id')
                            ->orWhere('stakeholder_teams.project_id', $project->id);
                    });
                }

                $roles = $project
                    ? $user->roleNamesForProject($organization->id, $project->id)
                    : $user->roleNamesForOrganization($organization->id);

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'roles' => $roles,
                    'org_roles' => $user->roleNamesForOrganization($organization->id),
                    'permissions' => $user->permissionNamesForProject($organization->id, $project?->id),
                    'companies' => $user->stakeholderCompanies()
                        ->wherePivot('organization_id', $organization->id)
                        ->wherePivot('is_active', true)
                        ->orderBy('stakeholder_companies.name')
                        ->get(['stakeholder_companies.id', 'stakeholder_companies.name'])
                        ->map(fn ($company) => [
                            'id' => $company->id,
                            'name' => $company->name,
                        ])
                        ->values(),
                    'teams' => $teamsQuery
                        ->orderBy('stakeholder_teams.name')
                        ->get(['stakeholder_teams.id', 'stakeholder_teams.name'])
                        ->map(fn ($team) => [
                            'id' => $team->id,
                            'name' => $team->name,
                        ])
                        ->values(),
                ];
            })
            ->values();

        return response()->json([
            'data' => $members,
        ]);
    }
}
