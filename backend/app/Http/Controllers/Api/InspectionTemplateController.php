<?php

namespace App\Http\Controllers\Api;

use App\Events\InspectionRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\InspectionTemplate;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InspectionTemplateController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', InspectionTemplate::class);

        $organization = $this->currentOrganization($request);

        $query = InspectionTemplate::query()
            ->where('organization_id', $organization->id)
            ->with(['project:id,name,code', 'creator:id,name,email']);

        if ($projectId = $request->integer('project_id')) {
            $query->where(function ($builder) use ($projectId): void {
                $builder->where('project_id', $projectId)
                    ->orWhereNull('project_id');
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        if ($request->filled('library_only')) {
            $query->where('is_library', $request->boolean('library_only'));
        } elseif (! $request->boolean('include_library', true)) {
            $query->where('is_library', false);
        }

        if ($discipline = trim($request->string('discipline')->toString())) {
            $query->where('discipline', $discipline);
        }

        if ($type = $request->string('type')->toString()) {
            $query->where('type', $type);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        $templates = $query
            ->orderByDesc('is_library')
            ->orderByDesc('is_active')
            ->orderBy('type')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $templates,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', InspectionTemplate::class);

        $organization = $this->currentOrganization($request);
        $validated = $this->validatePayload($request);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $template = InspectionTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $validated['project_id'] ?? null,
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'type' => $validated['type'],
            'discipline' => $validated['discipline'] ?? null,
            'description' => $validated['description'] ?? null,
            'schema' => $validated['schema'],
            'approval_workflow' => $validated['approval_workflow'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'is_library' => false,
            'library_key' => null,
            'version' => 1,
            'created_by' => $request->user()->id,
        ]);

        event(new InspectionRealtimeMessage($organization->id, [
            'action' => 'template_created',
            'inspection_template_id' => $template->id,
            'type' => $template->type,
            'project_id' => $template->project_id,
        ]));

        return response()->json([
            'data' => $template->fresh(['project:id,name,code', 'creator:id,name,email']),
        ], 201);
    }

    public function show(Request $request, InspectionTemplate $inspectionTemplate): JsonResponse
    {
        $this->assertOrganization($inspectionTemplate->organization_id, $request);
        $this->authorize('view', $inspectionTemplate);

        $inspectionTemplate->load(['project:id,name,code', 'creator:id,name,email']);

        return response()->json([
            'data' => $inspectionTemplate,
        ]);
    }

    public function update(Request $request, InspectionTemplate $inspectionTemplate): JsonResponse
    {
        $this->assertOrganization($inspectionTemplate->organization_id, $request);
        $this->authorize('update', $inspectionTemplate);

        if ($inspectionTemplate->is_library) {
            abort(422, 'Library templates are read-only. Clone to create an editable template.');
        }

        $validated = $this->validatePayload($request, partial: true);

        if (array_key_exists('project_id', $validated) && $validated['project_id']) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $inspectionTemplate->fill([
            'project_id' => array_key_exists('project_id', $validated) ? $validated['project_id'] : $inspectionTemplate->project_id,
            'name' => $validated['name'] ?? $inspectionTemplate->name,
            'code' => array_key_exists('code', $validated) ? $validated['code'] : $inspectionTemplate->code,
            'type' => $validated['type'] ?? $inspectionTemplate->type,
            'discipline' => array_key_exists('discipline', $validated) ? $validated['discipline'] : $inspectionTemplate->discipline,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $inspectionTemplate->description,
            'schema' => $validated['schema'] ?? $inspectionTemplate->schema,
            'approval_workflow' => array_key_exists('approval_workflow', $validated) ? $validated['approval_workflow'] : $inspectionTemplate->approval_workflow,
            'is_active' => $validated['is_active'] ?? $inspectionTemplate->is_active,
            'version' => $inspectionTemplate->version + 1,
        ]);
        $inspectionTemplate->save();

        event(new InspectionRealtimeMessage($inspectionTemplate->organization_id, [
            'action' => 'template_updated',
            'inspection_template_id' => $inspectionTemplate->id,
            'type' => $inspectionTemplate->type,
            'project_id' => $inspectionTemplate->project_id,
        ]));

        return response()->json([
            'data' => $inspectionTemplate->fresh(['project:id,name,code', 'creator:id,name,email']),
        ]);
    }

    public function destroy(Request $request, InspectionTemplate $inspectionTemplate): JsonResponse
    {
        $this->assertOrganization($inspectionTemplate->organization_id, $request);
        $this->authorize('delete', $inspectionTemplate);

        if ($inspectionTemplate->is_library) {
            abort(422, 'Library templates are read-only. Clone to create an editable template.');
        }

        $inspectionTemplate->delete();

        event(new InspectionRealtimeMessage($inspectionTemplate->organization_id, [
            'action' => 'template_deleted',
            'inspection_template_id' => $inspectionTemplate->id,
            'type' => $inspectionTemplate->type,
            'project_id' => $inspectionTemplate->project_id,
        ]));

        return response()->json([
            'message' => 'Inspection template deleted.',
        ]);
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $prefix = $partial ? 'sometimes|' : '';

        return $request->validate([
            'project_id' => [$prefix.'nullable', 'integer', 'exists:projects,id'],
            'name' => [$prefix.'required', 'string', 'max:255'],
            'code' => [$prefix.'nullable', 'string', 'max:120'],
            'type' => [$prefix.'required', 'string', 'max:120'],
            'discipline' => [$prefix.'nullable', 'string', 'max:120'],
            'description' => [$prefix.'nullable', 'string'],
            'is_active' => [$prefix.'sometimes', 'boolean'],
            'schema' => [$prefix.'required', 'array'],
            'schema.sections' => [$prefix.'required', 'array', 'min:1'],
            'schema.sections.*.title' => ['required_with:schema.sections', 'string', 'max:255'],
            'schema.sections.*.fields' => ['required_with:schema.sections', 'array', 'min:1'],
            'schema.sections.*.fields.*.key' => ['required_with:schema.sections.*.fields', 'string', 'max:120'],
            'schema.sections.*.fields.*.label' => ['required_with:schema.sections.*.fields', 'string', 'max:255'],
            'schema.sections.*.fields.*.type' => ['required_with:schema.sections.*.fields', 'in:text,textarea,number,select,date,checkbox'],
            'schema.sections.*.fields.*.required' => ['sometimes', 'boolean'],
            'schema.sections.*.fields.*.options' => ['nullable', 'array'],
            'approval_workflow' => [$prefix.'nullable', 'array'],
            'approval_workflow.*.step_order' => ['required_with:approval_workflow', 'integer', 'min:1'],
            'approval_workflow.*.step_name' => ['nullable', 'string', 'max:255'],
            'approval_workflow.*.role_name' => ['required_with:approval_workflow', 'string', 'max:120'],
            'approval_workflow.*.requires_signature' => ['sometimes', 'boolean'],
        ]);
    }

    public function cloneFromLibrary(Request $request, InspectionTemplate $inspectionTemplate): JsonResponse
    {
        $this->assertOrganization($inspectionTemplate->organization_id, $request);
        $this->authorize('create', InspectionTemplate::class);

        if (! $inspectionTemplate->is_library) {
            abort(422, 'Only library templates can be cloned.');
        }

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $clone = InspectionTemplate::query()->create([
            'organization_id' => $inspectionTemplate->organization_id,
            'project_id' => $validated['project_id'] ?? null,
            'name' => $validated['name'] ?? $inspectionTemplate->name.' (Copy)',
            'code' => $validated['code'] ?? $inspectionTemplate->code,
            'type' => $inspectionTemplate->type,
            'discipline' => $inspectionTemplate->discipline,
            'description' => $inspectionTemplate->description,
            'schema' => $inspectionTemplate->schema,
            'approval_workflow' => $inspectionTemplate->approval_workflow,
            'is_active' => $validated['is_active'] ?? true,
            'is_library' => false,
            'library_key' => $inspectionTemplate->library_key,
            'version' => 1,
            'created_by' => $request->user()->id,
        ]);

        event(new InspectionRealtimeMessage($inspectionTemplate->organization_id, [
            'action' => 'template_cloned',
            'inspection_template_id' => $clone->id,
            'source_template_id' => $inspectionTemplate->id,
            'type' => $clone->type,
            'project_id' => $clone->project_id,
        ]));

        return response()->json([
            'data' => $clone->fresh(['project:id,name,code', 'creator:id,name,email']),
        ], 201);
    }
}
