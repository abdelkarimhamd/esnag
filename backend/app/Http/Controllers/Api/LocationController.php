<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Drawing;
use App\Models\Location;
use App\Models\Snag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    use InteractsWithOrganizationContext;

    public function resolveByBarcode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'barcode' => ['required', 'string', 'max:255'],
        ]);

        $organization = $this->currentOrganization($request);
        $normalizedBarcode = trim((string) $validated['barcode']);

        $location = Location::query()
            ->where('organization_id', $organization->id)
            ->whereRaw('LOWER(barcode) = ?', [mb_strtolower($normalizedBarcode)])
            ->with([
                'floor:id,building_id,name,code,level',
                'floor.building:id,project_id,name,code',
            ])
            ->first();

        if (! $location || ! $location->floor || ! $location->floor->building) {
            abort(404, 'Location barcode not found.');
        }

        $project = $location->floor->building->project;
        if (! $project) {
            abort(404, 'Location project context is missing.');
        }

        $this->authorize('view', $project);

        $drawing = Drawing::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->orderByRaw('CASE WHEN floor_id = ? THEN 0 ELSE 1 END', [$location->floor_id])
            ->orderByRaw('CASE WHEN building_id = ? THEN 0 ELSE 1 END', [$location->floor->building_id])
            ->orderBy('id')
            ->with('currentRevision')
            ->first();

        $snagsTotal = Snag::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->where('location_id', $location->id)
            ->count();

        $snagsOpen = Snag::query()
            ->where('organization_id', $organization->id)
            ->where('project_id', $project->id)
            ->where('location_id', $location->id)
            ->whereNotIn('status', ['closed', 'rejected'])
            ->count();

        $deepLink = $drawing
            ? sprintf('/projects/%d/drawings/%d?location_id=%d&barcode=%s', $project->id, $drawing->id, $location->id, rawurlencode($normalizedBarcode))
            : sprintf('/projects/%d?location_id=%d&barcode=%s', $project->id, $location->id, rawurlencode($normalizedBarcode));

        return response()->json([
            'data' => [
                'barcode' => $normalizedBarcode,
                'location' => [
                    'id' => $location->id,
                    'name' => $location->name,
                    'code' => $location->code,
                    'barcode' => $location->barcode,
                    'floor_id' => $location->floor_id,
                ],
                'floor' => [
                    'id' => $location->floor->id,
                    'name' => $location->floor->name,
                    'code' => $location->floor->code,
                    'level' => $location->floor->level,
                ],
                'building' => [
                    'id' => $location->floor->building->id,
                    'name' => $location->floor->building->name,
                    'code' => $location->floor->building->code,
                ],
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                ],
                'drawing' => $drawing ? [
                    'id' => $drawing->id,
                    'title' => $drawing->title,
                    'code' => $drawing->code,
                    'current_revision_id' => $drawing->current_revision_id,
                ] : null,
                'snags' => [
                    'total' => $snagsTotal,
                    'open' => $snagsOpen,
                ],
                'deep_link' => $deepLink,
                'filters' => [
                    'location_id' => $location->id,
                    'project_id' => $project->id,
                    'drawing_id' => $drawing?->id,
                ],
            ],
        ]);
    }
}
