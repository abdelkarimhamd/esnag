<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\Location;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EquipmentController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Equipment::class);
        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = Equipment::query()
            ->where('organization_id', $organization->id)
            ->with([
                'project:id,name,code',
                'location:id,name,code,barcode',
            ]);

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($locationId = $request->integer('location_id')) {
            $query->where('location_id', $locationId);
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($barcode = $request->string('barcode')->toString()) {
            $query->where('barcode', $barcode);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('serial_number', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        return response()->json($query->orderBy('name')->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Equipment::class);
        $organization = $this->currentOrganization($request);

        $validated = $this->validatePayload($request);
        $this->assertScopedReferences($request, $validated);

        $equipment = Equipment::query()->create([
            ...$validated,
            'organization_id' => $organization->id,
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => $equipment->fresh(['project:id,name,code', 'location:id,name,code,barcode']),
        ], 201);
    }

    public function show(Request $request, Equipment $equipment): JsonResponse
    {
        $this->assertOrganization($equipment->organization_id, $request);
        $this->authorize('view', $equipment);

        $equipment->load([
            'project:id,name,code',
            'location:id,name,code,barcode',
            'maintenanceLogs' => fn ($query) => $query
                ->with(['performer:id,name,email', 'snag:id,reference,title,status'])
                ->orderByDesc('occurred_at'),
        ]);

        return response()->json([
            'data' => $equipment,
        ]);
    }

    public function update(Request $request, Equipment $equipment): JsonResponse
    {
        $this->assertOrganization($equipment->organization_id, $request);
        $this->authorize('update', $equipment);

        $validated = $this->validatePayload($request, true);
        $this->assertScopedReferences($request, $validated);

        $equipment->fill([
            'project_id' => array_key_exists('project_id', $validated) ? $validated['project_id'] : $equipment->project_id,
            'location_id' => array_key_exists('location_id', $validated) ? $validated['location_id'] : $equipment->location_id,
            'code' => $validated['code'] ?? $equipment->code,
            'name' => $validated['name'] ?? $equipment->name,
            'category' => array_key_exists('category', $validated) ? $validated['category'] : $equipment->category,
            'barcode' => array_key_exists('barcode', $validated) ? $validated['barcode'] : $equipment->barcode,
            'serial_number' => array_key_exists('serial_number', $validated) ? $validated['serial_number'] : $equipment->serial_number,
            'manufacturer' => array_key_exists('manufacturer', $validated) ? $validated['manufacturer'] : $equipment->manufacturer,
            'model' => array_key_exists('model', $validated) ? $validated['model'] : $equipment->model,
            'status' => $validated['status'] ?? $equipment->status,
            'installed_at' => array_key_exists('installed_at', $validated) ? $validated['installed_at'] : $equipment->installed_at,
            'notes' => array_key_exists('notes', $validated) ? $validated['notes'] : $equipment->notes,
        ]);
        $equipment->save();

        return response()->json([
            'data' => $equipment->fresh(['project:id,name,code', 'location:id,name,code,barcode']),
        ]);
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $prefix = $partial ? 'sometimes|' : '';

        return $request->validate([
            'project_id' => [$prefix.'nullable', 'integer', 'exists:projects,id'],
            'location_id' => [$prefix.'nullable', 'integer', 'exists:locations,id'],
            'code' => [$prefix.'required', 'string', 'max:120'],
            'name' => [$prefix.'required', 'string', 'max:255'],
            'category' => [$prefix.'nullable', 'string', 'max:120'],
            'barcode' => [$prefix.'nullable', 'string', 'max:180'],
            'serial_number' => [$prefix.'nullable', 'string', 'max:180'],
            'manufacturer' => [$prefix.'nullable', 'string', 'max:180'],
            'model' => [$prefix.'nullable', 'string', 'max:180'],
            'status' => [$prefix.'sometimes', 'in:ok,warn,critical,inactive'],
            'installed_at' => [$prefix.'nullable', 'date'],
            'notes' => [$prefix.'nullable', 'string'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function assertScopedReferences(Request $request, array $validated): void
    {
        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        if (! empty($validated['location_id'])) {
            $location = Location::query()->findOrFail($validated['location_id']);
            $this->assertOrganization($location->organization_id, $request);
        }
    }
}
