<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\EquipmentMaintenanceLog;
use App\Models\Snag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class EquipmentMaintenanceLogController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request, Equipment $equipment): JsonResponse
    {
        $this->assertOrganization($equipment->organization_id, $request);
        $this->authorize('view', $equipment);

        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = $equipment->maintenanceLogs()
            ->with(['performer:id,name,email', 'snag:id,reference,title,status'])
            ->orderByDesc('occurred_at');

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate($perPage));
    }

    public function store(Request $request, Equipment $equipment): JsonResponse
    {
        $this->assertOrganization($equipment->organization_id, $request);
        $this->authorize('logMaintenance', $equipment);

        $validated = $request->validate([
            'snag_id' => ['nullable', 'integer', 'exists:snags,id'],
            'status' => ['required', 'in:ok,warn,critical'],
            'description' => ['nullable', 'string'],
            'action_taken' => ['nullable', 'string'],
            'occurred_at' => ['nullable', 'date'],
            'next_due_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $snagId = null;
        if (! empty($validated['snag_id'])) {
            $snag = Snag::query()->findOrFail($validated['snag_id']);
            $this->assertOrganization($snag->organization_id, $request);
            $snagId = $snag->id;
        }

        $log = EquipmentMaintenanceLog::query()->create([
            'organization_id' => $equipment->organization_id,
            'equipment_id' => $equipment->id,
            'project_id' => $equipment->project_id,
            'snag_id' => $snagId,
            'performed_by' => $request->user()->id,
            'status' => $validated['status'],
            'description' => $validated['description'] ?? null,
            'action_taken' => $validated['action_taken'] ?? null,
            'occurred_at' => ! empty($validated['occurred_at']) ? Carbon::parse($validated['occurred_at']) : Carbon::now(),
            'next_due_at' => ! empty($validated['next_due_at']) ? Carbon::parse($validated['next_due_at']) : null,
            'metadata' => $validated['metadata'] ?? null,
        ]);

        $equipment->status = $validated['status'];
        $equipment->last_maintenance_at = Carbon::now();
        $equipment->save();

        if ($snagId) {
            Snag::query()->whereKey($snagId)->update(['equipment_id' => $equipment->id]);
        }

        return response()->json([
            'data' => $log->fresh(['performer:id,name,email', 'snag:id,reference,title,status']),
        ], 201);
    }
}
