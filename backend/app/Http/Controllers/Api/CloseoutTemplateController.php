<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\CloseoutTemplate;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CloseoutTemplateController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', CloseoutTemplate::class);

        $organization = $this->currentOrganization($request);

        $query = CloseoutTemplate::query()
            ->where('organization_id', $organization->id)
            ->with(['items', 'project:id,name,code']);

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

        if ($trade = $request->string('trade')->toString()) {
            $query->where('trade', $trade);
        }

        $templates = $query
            ->orderByDesc('is_library')
            ->orderByDesc('is_default')
            ->orderBy('project_id')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $templates,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', CloseoutTemplate::class);

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'name' => ['required', 'string', 'max:255'],
            'trade' => ['nullable', 'string', 'max:120'],
            'discipline' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'is_default' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.title' => ['required', 'string', 'max:255'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.required' => ['sometimes', 'boolean'],
            'items.*.evidence_required' => ['sometimes', 'boolean'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $template = CloseoutTemplate::query()->create([
            'organization_id' => $organization->id,
            'project_id' => $validated['project_id'] ?? null,
            'name' => $validated['name'],
            'trade' => $validated['trade'] ?? null,
            'discipline' => $validated['discipline'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_default' => $validated['is_default'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'is_library' => false,
            'library_key' => null,
            'created_by' => $request->user()->id,
        ]);

        foreach ($validated['items'] as $index => $item) {
            $template->items()->create([
                'title' => $item['title'],
                'description' => $item['description'] ?? null,
                'required' => $item['required'] ?? true,
                'evidence_required' => $item['evidence_required'] ?? true,
                'sort_order' => $index,
            ]);
        }

        $this->syncDefaultState($template);

        return response()->json([
            'data' => $template->fresh(['items', 'project:id,name,code']),
        ], 201);
    }

    public function show(Request $request, CloseoutTemplate $closeoutTemplate): JsonResponse
    {
        $this->assertOrganization($closeoutTemplate->organization_id, $request);
        $this->authorize('view', $closeoutTemplate);

        $closeoutTemplate->load(['items', 'project:id,name,code', 'creator:id,name,email']);

        return response()->json([
            'data' => $closeoutTemplate,
        ]);
    }

    public function update(Request $request, CloseoutTemplate $closeoutTemplate): JsonResponse
    {
        $this->assertOrganization($closeoutTemplate->organization_id, $request);
        $this->authorize('update', $closeoutTemplate);

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'trade' => ['nullable', 'string', 'max:120'],
            'discipline' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'is_default' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.title' => ['required_with:items', 'string', 'max:255'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.required' => ['sometimes', 'boolean'],
            'items.*.evidence_required' => ['sometimes', 'boolean'],
        ]);

        if ($closeoutTemplate->is_library) {
            abort(422, 'Library templates are read-only. Clone to create an editable project template.');
        }

        if (array_key_exists('project_id', $validated) && $validated['project_id']) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $closeoutTemplate->fill([
            'project_id' => array_key_exists('project_id', $validated) ? $validated['project_id'] : $closeoutTemplate->project_id,
            'name' => $validated['name'] ?? $closeoutTemplate->name,
            'trade' => array_key_exists('trade', $validated) ? $validated['trade'] : $closeoutTemplate->trade,
            'discipline' => array_key_exists('discipline', $validated) ? $validated['discipline'] : $closeoutTemplate->discipline,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $closeoutTemplate->description,
            'is_default' => $validated['is_default'] ?? $closeoutTemplate->is_default,
            'is_active' => $validated['is_active'] ?? $closeoutTemplate->is_active,
        ]);
        $closeoutTemplate->save();

        if (array_key_exists('items', $validated)) {
            $closeoutTemplate->items()->delete();

            foreach ($validated['items'] as $index => $item) {
                $closeoutTemplate->items()->create([
                    'title' => $item['title'],
                    'description' => $item['description'] ?? null,
                    'required' => $item['required'] ?? true,
                    'evidence_required' => $item['evidence_required'] ?? true,
                    'sort_order' => $index,
                ]);
            }
        }

        $this->syncDefaultState($closeoutTemplate);

        return response()->json([
            'data' => $closeoutTemplate->fresh(['items', 'project:id,name,code']),
        ]);
    }

    public function destroy(Request $request, CloseoutTemplate $closeoutTemplate): JsonResponse
    {
        $this->assertOrganization($closeoutTemplate->organization_id, $request);
        $this->authorize('delete', $closeoutTemplate);

        if ($closeoutTemplate->is_library) {
            abort(422, 'Library templates are read-only. Clone to create an editable project template.');
        }

        $closeoutTemplate->delete();

        return response()->json([
            'message' => 'Closeout template deleted.',
        ]);
    }

    public function cloneFromLibrary(Request $request, CloseoutTemplate $closeoutTemplate): JsonResponse
    {
        $this->assertOrganization($closeoutTemplate->organization_id, $request);
        $this->authorize('create', CloseoutTemplate::class);

        if (! $closeoutTemplate->is_library) {
            abort(422, 'Only library templates can be cloned.');
        }

        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'is_default' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $clone = CloseoutTemplate::query()->create([
            'organization_id' => $closeoutTemplate->organization_id,
            'project_id' => $validated['project_id'] ?? null,
            'name' => $validated['name'] ?? $closeoutTemplate->name.' (Copy)',
            'trade' => $closeoutTemplate->trade,
            'discipline' => $closeoutTemplate->discipline,
            'description' => $closeoutTemplate->description,
            'is_default' => $validated['is_default'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'is_library' => false,
            'library_key' => $closeoutTemplate->library_key,
            'created_by' => $request->user()->id,
        ]);

        foreach ($closeoutTemplate->items()->orderBy('sort_order')->get() as $item) {
            $clone->items()->create([
                'title' => $item->title,
                'description' => $item->description,
                'required' => $item->required,
                'evidence_required' => $item->evidence_required,
                'sort_order' => $item->sort_order,
            ]);
        }

        $this->syncDefaultState($clone);

        return response()->json([
            'data' => $clone->fresh(['items', 'project:id,name,code']),
        ], 201);
    }

    private function syncDefaultState(CloseoutTemplate $template): void
    {
        if (! $template->is_default) {
            return;
        }

        CloseoutTemplate::query()
            ->where('organization_id', $template->organization_id)
            ->where(function ($builder) use ($template): void {
                if ($template->project_id) {
                    $builder->where('project_id', $template->project_id);
                } else {
                    $builder->whereNull('project_id');
                }
            })
            ->where('id', '!=', $template->id)
            ->update(['is_default' => false]);
    }
}
