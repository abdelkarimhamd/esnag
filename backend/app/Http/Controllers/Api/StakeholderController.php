<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\StakeholderCompany;
use App\Models\StakeholderTeam;
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StakeholderController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function companies(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $this->assertCanView($request, $organization->id, $request->integer('project_id') ?: null);

        $companies = StakeholderCompany::query()
            ->where('organization_id', $organization->id)
            ->withCount([
                'users as active_members_count' => fn ($query) => $query->where('company_user.is_active', true),
                'teams as active_teams_count' => fn ($query) => $query->where('is_active', true),
            ])
            ->with(['teams:id,organization_id,project_id,company_id,name,code,is_active'])
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $companies,
        ]);
    }

    public function storeCompany(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        if (! $request->user()->hasPermissionInOrganization($organization->id, 'projects.manage')) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'type' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
            'member_user_ids' => ['nullable', 'array'],
            'member_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $company = DB::transaction(function () use ($organization, $validated) {
            $company = StakeholderCompany::query()->create([
                'organization_id' => $organization->id,
                'name' => $validated['name'],
                'code' => $validated['code'] ?? null,
                'type' => $validated['type'] ?? 'contractor',
                'is_active' => $validated['is_active'] ?? true,
            ]);

            $memberUserIds = collect($validated['member_user_ids'] ?? [])->unique()->values();
            if ($memberUserIds->isNotEmpty()) {
                $validUserIds = $organization->users()
                    ->wherePivot('is_active', true)
                    ->whereIn('users.id', $memberUserIds->all())
                    ->pluck('users.id')
                    ->values()
                    ->all();

                $company->users()->sync(collect($validUserIds)->mapWithKeys(fn (int $id) => [
                    $id => [
                        'organization_id' => $organization->id,
                        'is_active' => true,
                        'is_primary' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                ])->all());
            }

            return $company;
        });

        return response()->json([
            'data' => $company->load(['users:id,name,email']),
        ], 201);
    }

    public function updateCompany(Request $request, StakeholderCompany $company): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if ($company->organization_id !== $organization->id) {
            abort(404);
        }

        if (! $request->user()->hasPermissionInOrganization($organization->id, 'projects.manage')) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'type' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
            'member_user_ids' => ['nullable', 'array'],
            'member_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        DB::transaction(function () use ($organization, $company, $validated): void {
            $company->fill([
                'name' => $validated['name'] ?? $company->name,
                'code' => $validated['code'] ?? $company->code,
                'type' => $validated['type'] ?? $company->type,
                'is_active' => $validated['is_active'] ?? $company->is_active,
            ]);
            $company->save();

            if (array_key_exists('member_user_ids', $validated)) {
                $memberUserIds = collect($validated['member_user_ids'] ?? [])->unique()->values();
                $validUserIds = $organization->users()
                    ->wherePivot('is_active', true)
                    ->whereIn('users.id', $memberUserIds->all())
                    ->pluck('users.id')
                    ->values()
                    ->all();

                $company->users()->sync(collect($validUserIds)->mapWithKeys(fn (int $id) => [
                    $id => [
                        'organization_id' => $organization->id,
                        'is_active' => true,
                        'is_primary' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                ])->all());
            }
        });

        return response()->json([
            'data' => $company->fresh(['users:id,name,email', 'teams:id,organization_id,project_id,company_id,name,code,is_active']),
        ]);
    }

    public function teams(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        $projectId = $request->integer('project_id') ?: null;
        $this->assertCanView($request, $organization->id, $projectId);

        $query = StakeholderTeam::query()
            ->where('organization_id', $organization->id)
            ->with(['company:id,name,code,type', 'project:id,name,code'])
            ->withCount([
                'users as active_members_count' => fn ($builder) => $builder->where('team_user.is_active', true),
            ])
            ->orderBy('name');

        if ($projectId !== null) {
            $query->where(function ($builder) use ($projectId): void {
                $builder->whereNull('project_id')
                    ->orWhere('project_id', $projectId);
            });
        }

        if ($companyId = $request->integer('company_id')) {
            $query->where('company_id', $companyId);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function storeTeam(Request $request): JsonResponse
    {
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'is_active' => ['sometimes', 'boolean'],
            'member_user_ids' => ['nullable', 'array'],
            'member_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $project = null;
        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            if ($project->organization_id !== $organization->id) {
                abort(404);
            }
        }

        $company = null;
        if (! empty($validated['company_id'])) {
            $company = StakeholderCompany::query()->findOrFail($validated['company_id']);
            if ($company->organization_id !== $organization->id) {
                abort(404);
            }
        }

        $this->assertCanManage($request, $organization->id, $project?->id);

        $team = DB::transaction(function () use ($organization, $project, $company, $validated) {
            $team = StakeholderTeam::query()->create([
                'organization_id' => $organization->id,
                'project_id' => $project?->id,
                'company_id' => $company?->id,
                'name' => $validated['name'],
                'code' => $validated['code'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            $memberUserIds = collect($validated['member_user_ids'] ?? [])->unique()->values();
            if ($memberUserIds->isNotEmpty()) {
                $validUserIds = $organization->users()
                    ->wherePivot('is_active', true)
                    ->whereIn('users.id', $memberUserIds->all())
                    ->pluck('users.id')
                    ->values()
                    ->all();

                $team->users()->sync(collect($validUserIds)->mapWithKeys(fn (int $id) => [
                    $id => [
                        'organization_id' => $organization->id,
                        'is_active' => true,
                        'is_lead' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                ])->all());
            }

            return $team;
        });

        return response()->json([
            'data' => $team->load(['users:id,name,email', 'company:id,name,code,type', 'project:id,name,code']),
        ], 201);
    }

    public function updateTeam(Request $request, StakeholderTeam $team): JsonResponse
    {
        $organization = $this->currentOrganization($request);
        if ($team->organization_id !== $organization->id) {
            abort(404);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'is_active' => ['sometimes', 'boolean'],
            'member_user_ids' => ['nullable', 'array'],
            'member_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $projectId = array_key_exists('project_id', $validated)
            ? (int) ($validated['project_id'] ?? 0)
            : (int) ($team->project_id ?? 0);

        $this->assertCanManage($request, $organization->id, $projectId > 0 ? $projectId : null);

        DB::transaction(function () use ($organization, $team, $validated): void {
            if (array_key_exists('project_id', $validated) && $validated['project_id']) {
                $project = Project::query()->findOrFail($validated['project_id']);
                if ($project->organization_id !== $organization->id) {
                    abort(404);
                }
                $team->project_id = $project->id;
            }

            if (array_key_exists('project_id', $validated) && ! $validated['project_id']) {
                $team->project_id = null;
            }

            if (array_key_exists('company_id', $validated) && $validated['company_id']) {
                $company = StakeholderCompany::query()->findOrFail($validated['company_id']);
                if ($company->organization_id !== $organization->id) {
                    abort(404);
                }
                $team->company_id = $company->id;
            }

            if (array_key_exists('company_id', $validated) && ! $validated['company_id']) {
                $team->company_id = null;
            }

            if (array_key_exists('name', $validated)) {
                $team->name = $validated['name'];
            }

            if (array_key_exists('code', $validated)) {
                $team->code = $validated['code'];
            }

            if (array_key_exists('is_active', $validated)) {
                $team->is_active = (bool) $validated['is_active'];
            }

            $team->save();

            if (array_key_exists('member_user_ids', $validated)) {
                $memberUserIds = collect($validated['member_user_ids'] ?? [])->unique()->values();
                $validUserIds = $organization->users()
                    ->wherePivot('is_active', true)
                    ->whereIn('users.id', $memberUserIds->all())
                    ->pluck('users.id')
                    ->values()
                    ->all();

                $team->users()->sync(collect($validUserIds)->mapWithKeys(fn (int $id) => [
                    $id => [
                        'organization_id' => $organization->id,
                        'is_active' => true,
                        'is_lead' => false,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                ])->all());
            }
        });

        return response()->json([
            'data' => $team->fresh(['users:id,name,email', 'company:id,name,code,type', 'project:id,name,code']),
        ]);
    }

    private function assertCanView(Request $request, int $organizationId, ?int $projectId): void
    {
        $user = $request->user();

        if ($projectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organizationId, $projectId, 'projects.view')
                && ! $this->accessControlService->allows($user, $organizationId, $projectId, 'snags.assign')
            ) {
                abort(403);
            }

            return;
        }

        if (
            ! $user->hasPermissionInOrganization($organizationId, 'projects.view')
            && ! $user->hasPermissionInOrganization($organizationId, 'snags.assign')
            && ! $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'projects.view')
            && ! $this->accessControlService->hasAnyProjectScopedPermission($user, $organizationId, 'snags.assign')
        ) {
            abort(403);
        }
    }

    private function assertCanManage(Request $request, int $organizationId, ?int $projectId): void
    {
        $user = $request->user();

        if ($projectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organizationId, $projectId, 'projects.manage')
                && ! $this->accessControlService->allows($user, $organizationId, $projectId, 'snags.assign')
            ) {
                abort(403);
            }

            return;
        }

        if (! $user->hasPermissionInOrganization($organizationId, 'projects.manage')) {
            abort(403);
        }
    }
}
