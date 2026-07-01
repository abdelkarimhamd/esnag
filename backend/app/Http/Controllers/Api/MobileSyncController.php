<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Building;
use App\Models\DrawingLocationZone;
use App\Models\Equipment;
use App\Models\EquipmentMaintenanceLog;
use App\Models\Floor;
use App\Models\Location;
use App\Models\Snag;
use App\Models\SnagAttachment;
use App\Models\SnagComment;
use App\Services\MobileSyncService;
use App\Services\OpsHealthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class MobileSyncController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly MobileSyncService $mobileSyncService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function pull(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            $this->denyWithPermissions($request, ['mobile.sync'], 'You do not have permission to use mobile sync.');
        }

        $organization = $this->currentOrganization($request);
        $since = null;

        if ($request->filled('since')) {
            try {
                $since = Carbon::parse((string) $request->query('since'));
            } catch (\Throwable) {
                $since = null;
            }
        }

        $snagsQuery = Snag::query()
            ->where('organization_id', $organization->id)
            ->with([
                'assignee:id,name,email',
                'creator:id,name,email',
            ])
            ->orderBy('updated_at')
            ->limit(500);

        if ($since) {
            $snagsQuery->where('updated_at', '>', $since);
        }

        $commentsQuery = SnagComment::query()
            ->where('organization_id', $organization->id)
            ->with('user:id,name,email')
            ->orderBy('updated_at')
            ->limit(1000);

        if ($since) {
            $commentsQuery->where('updated_at', '>', $since);
        }

        $attachmentsQuery = SnagAttachment::query()
            ->where('organization_id', $organization->id)
            ->orderBy('updated_at')
            ->limit(1000);

        if ($since) {
            $attachmentsQuery->where('updated_at', '>', $since);
        }

        $equipmentQuery = Equipment::query()
            ->where('organization_id', $organization->id)
            ->with(['project:id,name,code', 'location:id,name,code,barcode'])
            ->orderBy('updated_at')
            ->limit(500);

        if ($since) {
            $equipmentQuery->where('updated_at', '>', $since);
        }

        $maintenanceLogsQuery = EquipmentMaintenanceLog::query()
            ->where('organization_id', $organization->id)
            ->with(['performer:id,name,email', 'snag:id,reference,title,status'])
            ->orderBy('updated_at')
            ->limit(500);

        if ($since) {
            $maintenanceLogsQuery->where('updated_at', '>', $since);
        }

        $buildingsQuery = Building::query()
            ->where('organization_id', $organization->id)
            ->orderBy('updated_at')
            ->limit(1000);

        if ($since) {
            $buildingsQuery->where('updated_at', '>', $since);
        }

        $floorsQuery = Floor::query()
            ->where('organization_id', $organization->id)
            ->with('building:id,project_id')
            ->orderBy('updated_at')
            ->limit(1500);

        if ($since) {
            $floorsQuery->where('updated_at', '>', $since);
        }

        $locationsQuery = Location::query()
            ->where('organization_id', $organization->id)
            ->with([
                'floor:id,building_id',
                'floor.building:id,project_id',
            ])
            ->orderBy('updated_at')
            ->limit(5000);

        if ($since) {
            $locationsQuery->where('updated_at', '>', $since);
        }

        $zonesQuery = DrawingLocationZone::query()
            ->where('organization_id', $organization->id)
            ->with('location:id,floor_id')
            ->orderBy('updated_at')
            ->limit(6000);

        if ($since) {
            $zonesQuery->where('updated_at', '>', $since);
        }

        $zones = $zonesQuery->get()->map(function (DrawingLocationZone $zone): array {
            return [
                'id' => $zone->id,
                'organization_id' => $zone->organization_id,
                'drawing_id' => $zone->drawing_id,
                'drawing_revision_id' => $zone->drawing_revision_id,
                'location_id' => $zone->location_id,
                'floor_id' => $zone->location?->floor_id,
                'zone_label' => $zone->zone_label,
                'x_min' => $zone->x_min,
                'y_min' => $zone->y_min,
                'x_max' => $zone->x_max,
                'y_max' => $zone->y_max,
                'priority' => $zone->priority,
                'updated_at' => optional($zone->updated_at)->toISOString(),
            ];
        })->values();

        $floors = $floorsQuery->get()->map(function (Floor $floor): array {
            return [
                'id' => $floor->id,
                'organization_id' => $floor->organization_id,
                'building_id' => $floor->building_id,
                'project_id' => $floor->building?->project_id,
                'name' => $floor->name,
                'code' => $floor->code,
                'level' => $floor->level,
                'sort_order' => $floor->sort_order,
                'updated_at' => optional($floor->updated_at)->toISOString(),
            ];
        })->values();

        $locations = $locationsQuery->get()->map(function (Location $location): array {
            return [
                'id' => $location->id,
                'organization_id' => $location->organization_id,
                'floor_id' => $location->floor_id,
                'building_id' => $location->floor?->building_id,
                'project_id' => $location->floor?->building?->project_id,
                'name' => $location->name,
                'code' => $location->code,
                'type' => $location->type,
                'barcode' => $location->barcode,
                'updated_at' => optional($location->updated_at)->toISOString(),
            ];
        })->values();

        return response()->json([
            'data' => [
                'snags' => $snagsQuery->get(),
                'comments' => $commentsQuery->get(),
                'attachments' => $attachmentsQuery->get(),
                'equipment' => $equipmentQuery->get(),
                'equipment_logs' => $maintenanceLogsQuery->get(),
                'buildings' => $buildingsQuery->get(),
                'floors' => $floors,
                'locations' => $locations,
                'drawing_location_zones' => $zones,
            ],
            'meta' => [
                'server_time' => Carbon::now()->toISOString(),
                'conflict_policy' => 'last_write_wins_except_status_transition_guarded_server_side',
            ],
        ]);
    }

    public function apply(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            $this->denyWithPermissions($request, ['mobile.sync'], 'You do not have permission to use mobile sync.');
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'operations' => ['required', 'array', 'min:1'],
            'operations.*.op_id' => ['nullable', 'string', 'max:120'],
            'operations.*.type' => ['required', 'string', 'max:120'],
            'operations.*.payload' => ['nullable', 'array'],
            'operations.*.client_updated_at' => ['nullable', 'date'],
        ]);

        $operations = collect($validated['operations'])
            ->map(function (array $operation): array {
                return [
                    ...$operation,
                    'op_id' => (string) ($operation['op_id'] ?? Str::uuid()->toString()),
                ];
            })
            ->values()
            ->all();

        $results = $this->mobileSyncService->apply(
            $organization,
            $request->user(),
            $operations,
        );

        $results = collect($results)
            ->map(function (array $row): array {
                $status = (string) ($row['status'] ?? 'failed');
                $resultPayload = isset($row['result']) && is_array($row['result']) ? $row['result'] : [];
                $errorsPayload = isset($row['errors']) && is_array($row['errors']) ? $row['errors'] : [];

                $isDataConflict = $status === 'applied' && (bool) ($resultPayload['conflict'] ?? false);
                $isStatusTransitionGuard = $status === 'rejected' && array_key_exists('to_status', $errorsPayload);

                $retryable = match (true) {
                    $status === 'failed' => true,
                    $isDataConflict => true,
                    default => false,
                };

                $retryAfterSeconds = match (true) {
                    $status === 'failed' => 30,
                    $isDataConflict => 10,
                    default => null,
                };

                $conflictType = match (true) {
                    $isDataConflict => 'stale_update',
                    $isStatusTransitionGuard => 'status_transition_guarded',
                    default => null,
                };

                return [
                    ...$row,
                    'retryable' => $retryable,
                    'retry_after_seconds' => $retryAfterSeconds,
                    'conflict_type' => $conflictType,
                ];
            })
            ->values()
            ->all();

        $typeByOpId = collect($operations)
            ->mapWithKeys(fn (array $operation) => [
                (string) $operation['op_id'] => (string) ($operation['type'] ?? 'unknown'),
            ])
            ->all();

        foreach ($results as $result) {
            $status = (string) ($result['status'] ?? 'failed');
            $payload = null;
            $errorMessage = null;

            if (isset($result['result']) && is_array($result['result'])) {
                $payload = $result['result'];
            } elseif (isset($result['errors']) && is_array($result['errors'])) {
                $payload = ['errors' => $result['errors']];
            }

            if ($status !== 'applied') {
                if (isset($result['message']) && is_string($result['message'])) {
                    $errorMessage = $result['message'];
                } elseif (isset($result['errors']) && is_array($result['errors'])) {
                    $errorMessage = collect($result['errors'])
                        ->flatten()
                        ->map(fn ($value) => (string) $value)
                        ->first();
                }
            }

            $opId = (string) ($result['op_id'] ?? Str::uuid()->toString());
            $this->opsHealthService->recordSyncOperation(
                $organization->id,
                $request->user()->id,
                $opId,
                (string) ($typeByOpId[$opId] ?? 'unknown'),
                $status,
                $payload,
                $errorMessage,
            );
        }

        return response()->json([
            'data' => $results,
            'meta' => [
                'server_time' => Carbon::now()->toISOString(),
                'retry_recommended_for' => collect($results)
                    ->filter(fn (array $row) => (bool) ($row['retryable'] ?? false))
                    ->pluck('op_id')
                    ->values(),
            ],
        ]);
    }
}
