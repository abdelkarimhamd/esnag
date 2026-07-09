<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Building;
use App\Models\Drawing;
use App\Models\DrawingLocationZone;
use App\Models\DrawingRevision;
use App\Models\DrawingRevisionMapping;
use App\Models\Location;
use App\Models\Project;
use App\Models\Snag;
use App\Services\AttachmentComplianceService;
use App\Services\AccessControlService;
use App\Services\OpsHealthService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DrawingController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly AccessControlService $accessControlService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Drawing::class);

        $organization = $this->currentOrganization($request);
        $user = $request->user();
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = Drawing::query()
            ->where('organization_id', $organization->id)
            ->with(['currentRevision', 'building', 'floor'])
            ->withCount('snags');

        $canViewAll = $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'drawings.view');
        if (! $canViewAll) {
            $projectIds = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'drawings.view');

            if ($projectIds === []) {
                $this->denyWithPermissions($request, ['drawings.view'], 'You do not have permission to view drawings.');
            }

            $query->whereIn('project_id', $projectIds);
        }

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($buildingId = $request->integer('building_id')) {
            $query->where('building_id', $buildingId);
        }

        if ($areaId = $request->integer('area_id')) {
            $query->where('area_id', $areaId);
        }

        if ($floorId = $request->integer('floor_id')) {
            $query->where('floor_id', $floorId);
        }

        if ($search = $request->string('search')->toString()) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        $drawings = $query->orderBy('title')->paginate($perPage);

        return response()->json($drawings);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->assertOrganization($project->organization_id, $request);
        $this->authorize('create', Drawing::class);

        if (! $this->accessControlService->allows($request->user(), $project->organization_id, $project->id, 'drawings.manage')) {
            $this->denyWithPermissions($request, ['drawings.manage'], 'You do not have permission to manage drawings for this project.');
        }

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
        ]);

        // Auto-derive the Area from the Building when not supplied (BR-FR-028).
        if (empty($validated['area_id']) && ! empty($validated['building_id'])) {
            $validated['area_id'] = Building::query()->whereKey($validated['building_id'])->value('area_id');
        }

        $drawing = Drawing::create([
            ...$validated,
            'organization_id' => $project->organization_id,
            'project_id' => $project->id,
        ]);

        return response()->json([
            'data' => $drawing,
        ], 201);
    }

    public function show(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('view', $drawing);

        $drawing->load([
            'project',
            'building',
            'floor',
            'currentRevision',
            'revisions' => fn ($query) => $query->orderByDesc('created_at'),
            'locationZones' => fn ($query) => $query
                ->with('location:id,floor_id,name,code,barcode')
                ->orderByDesc('priority')
                ->orderBy('id'),
            'snags' => fn ($query) => $query
                ->with(['assignee:id,name,email'])
                ->orderByDesc('created_at'),
        ]);

        return response()->json([
            'data' => $drawing,
        ]);
    }

    public function update(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('update', $drawing);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['sometimes', 'required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
        ]);

        if (array_key_exists('building_id', $validated) && ! array_key_exists('area_id', $validated) && $validated['building_id']) {
            $validated['area_id'] = Building::query()->whereKey($validated['building_id'])->value('area_id');
        }

        $drawing->update($validated);

        return response()->json([
            'data' => $drawing->fresh(['currentRevision']),
        ]);
    }

    /**
     * Aggregated D4 overlay (item 12 / BR-FR-027/030). Returns every snag across a
     * building's (or area's) drawings with its severity, pin coordinates and owning
     * drawing/revision — so the client can render one combined, severity-coloured
     * plan view per building/area instead of one drawing at a time.
     */
    public function aggregate(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Drawing::class);
        $organization = $this->currentOrganization($request);
        $user = $request->user();

        $validated = $request->validate([
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'area_id' => ['nullable', 'integer', 'exists:areas,id'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
        ]);

        if (empty($validated['building_id']) && empty($validated['area_id'])) {
            abort(422, 'Provide a building_id or area_id to aggregate.');
        }

        $drawingsQuery = Drawing::query()->where('organization_id', $organization->id);

        if (! empty($validated['building_id'])) {
            $drawingsQuery->where('building_id', $validated['building_id']);
        }
        if (! empty($validated['area_id'])) {
            $drawingsQuery->where('area_id', $validated['area_id']);
        }
        if (! empty($validated['project_id'])) {
            $drawingsQuery->where('project_id', $validated['project_id']);
        }

        $canViewAll = $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'drawings.view');
        if (! $canViewAll) {
            $projectIds = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'drawings.view');
            if ($projectIds === []) {
                $this->denyWithPermissions($request, ['drawings.view'], 'You do not have permission to view drawings.');
            }
            $drawingsQuery->whereIn('project_id', $projectIds);
        }

        $drawings = $drawingsQuery
            ->with(['building:id,name,code,area_id', 'currentRevision:id,drawing_id,revision_label,mime_type'])
            ->get(['id', 'title', 'code', 'area_id', 'building_id', 'floor_id', 'current_revision_id', 'project_id']);

        $snags = Snag::query()
            ->where('organization_id', $organization->id)
            ->whereIn('drawing_id', $drawings->pluck('id'))
            ->whereNotNull('pin_x')
            ->whereNotNull('pin_y')
            ->with(['sourceOrganization:id,name,code,type'])
            ->get(['id', 'reference', 'title', 'status', 'severity', 'snag_type', 'source_organization_id', 'drawing_id', 'drawing_revision_id', 'pin_x', 'pin_y', 'building_id']);

        $bySeverity = $snags
            ->groupBy(fn (Snag $snag) => $snag->severity ?? 'unspecified')
            ->map->count();

        return response()->json([
            'data' => [
                'drawings' => $drawings,
                'snags' => $snags,
                'summary' => [
                    'total' => $snags->count(),
                    'by_severity' => $bySeverity,
                ],
            ],
        ]);
    }

    public function compare(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('view', $drawing);

        $validated = $request->validate([
            'left_revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
            'right_revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
        ]);

        $revisions = DrawingRevision::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->orderByDesc('created_at')
            ->get();

        if ($revisions->count() < 2) {
            abort(422, 'At least two revisions are required for comparison.');
        }

        $left = isset($validated['left_revision_id'])
            ? $revisions->firstWhere('id', (int) $validated['left_revision_id'])
            : ($revisions->firstWhere('id', $drawing->current_revision_id) ?? $revisions->first());

        $right = isset($validated['right_revision_id'])
            ? $revisions->firstWhere('id', (int) $validated['right_revision_id'])
            : $revisions->first(fn (DrawingRevision $revision) => $revision->id !== $left?->id);

        if (! $left || ! $right) {
            abort(422, 'Unable to resolve revisions for comparison.');
        }

        if ($left->id === $right->id) {
            abort(422, 'Choose two different revisions for comparison.');
        }

        $mapping = $this->resolveMapping($drawing, $left, $right);
        $canHighlight = str_starts_with($left->mime_type, 'image/') && str_starts_with($right->mime_type, 'image/');

        $snagCounts = Snag::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->selectRaw('drawing_revision_id, COUNT(*) as total')
            ->groupBy('drawing_revision_id')
            ->pluck('total', 'drawing_revision_id');

        return response()->json([
            'data' => [
                'drawing_id' => $drawing->id,
                'left_revision' => $this->formatRevisionForComparison($left, (int) ($snagCounts[$left->id] ?? 0)),
                'right_revision' => $this->formatRevisionForComparison($right, (int) ($snagCounts[$right->id] ?? 0)),
                'can_highlight' => $canHighlight,
                'mapping' => $mapping ? [
                    'id' => $mapping['model']->id,
                    'direction' => $mapping['direction'],
                    'transform_type' => $mapping['transform_type'],
                    'confidence_score' => $mapping['model']->confidence_score,
                    'notes' => $mapping['model']->notes,
                ] : null,
            ],
        ]);
    }

    public function migratePins(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('view', $drawing);

        $validated = $request->validate([
            'source_revision_id' => ['required', 'integer', 'exists:drawing_revisions,id'],
            'target_revision_id' => ['required', 'integer', 'exists:drawing_revisions,id', 'different:source_revision_id'],
            'dry_run' => ['sometimes', 'boolean'],
            'apply' => ['sometimes', 'boolean'],
            'snag_ids' => ['nullable', 'array', 'max:500'],
            'snag_ids.*' => ['integer', 'exists:snags,id'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $apply = (bool) ($validated['apply'] ?? false);
        $dryRun = $apply ? false : (bool) ($validated['dry_run'] ?? true);

        if ($apply) {
            $this->authorize('update', $drawing);
        }

        $sourceRevision = DrawingRevision::query()->findOrFail((int) $validated['source_revision_id']);
        $targetRevision = DrawingRevision::query()->findOrFail((int) $validated['target_revision_id']);

        if (
            $sourceRevision->drawing_id !== $drawing->id
            || $targetRevision->drawing_id !== $drawing->id
            || $sourceRevision->organization_id !== $drawing->organization_id
            || $targetRevision->organization_id !== $drawing->organization_id
        ) {
            abort(422, 'Selected revisions are not part of this drawing.');
        }

        $mapping = $this->resolveMapping($drawing, $sourceRevision, $targetRevision);
        if (! $mapping) {
            abort(422, 'No compatible revision mapping found between the selected revisions.');
        }

        $limit = (int) ($validated['limit'] ?? 300);
        $snagQuery = Snag::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->where('drawing_revision_id', $sourceRevision->id);

        if (! empty($validated['snag_ids'])) {
            $snagQuery->whereIn('id', $validated['snag_ids']);
        }

        $totalCandidates = (clone $snagQuery)->count();
        $snags = $snagQuery
            ->orderBy('id')
            ->limit($limit)
            ->get(['id', 'reference', 'pin_x', 'pin_y', 'status', 'location_id', 'drawing_revision_id']);

        $migratedRows = [];
        foreach ($snags as $snag) {
            $next = DrawingRevisionMapping::applyTransform(
                $mapping['transform_type'],
                $mapping['transform_params'],
                (float) $snag->pin_x,
                (float) $snag->pin_y,
            );

            $migratedRows[] = [
                'snag_id' => $snag->id,
                'reference' => $snag->reference,
                'status' => $snag->status,
                'location_id' => $snag->location_id,
                'from' => [
                    'revision_id' => $sourceRevision->id,
                    'pin_x' => (float) $snag->pin_x,
                    'pin_y' => (float) $snag->pin_y,
                ],
                'to' => [
                    'revision_id' => $targetRevision->id,
                    'pin_x' => $next['x'],
                    'pin_y' => $next['y'],
                    'was_clamped' => $next['was_clamped'],
                ],
            ];
        }

        if ($apply) {
            DB::transaction(function () use ($snags, $migratedRows, $targetRevision): void {
                $migrationBySnagId = collect($migratedRows)->keyBy('snag_id');

                foreach ($snags as $snag) {
                    $row = $migrationBySnagId->get($snag->id);
                    if (! $row) {
                        continue;
                    }

                    $snag->update([
                        'drawing_revision_id' => $targetRevision->id,
                        'pin_x' => $row['to']['pin_x'],
                        'pin_y' => $row['to']['pin_y'],
                    ]);
                }
            });
        }

        return response()->json([
            'data' => [
                'dry_run' => $dryRun,
                'applied' => $apply,
                'total_candidates' => $totalCandidates,
                'processed_count' => count($migratedRows),
                'truncated' => $totalCandidates > $limit,
                'source_revision' => $this->formatRevisionForComparison($sourceRevision, 0),
                'target_revision' => $this->formatRevisionForComparison($targetRevision, 0),
                'mapping' => [
                    'id' => $mapping['model']->id,
                    'direction' => $mapping['direction'],
                    'transform_type' => $mapping['transform_type'],
                    'confidence_score' => $mapping['model']->confidence_score,
                ],
                'migrated' => $migratedRows,
            ],
        ]);
    }

    public function locationSuggestions(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('view', $drawing);

        $validated = $request->validate([
            'pin_x' => ['required', 'numeric', 'min:0', 'max:1'],
            'pin_y' => ['required', 'numeric', 'min:0', 'max:1'],
            'revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $pinX = (float) $validated['pin_x'];
        $pinY = (float) $validated['pin_y'];
        $revisionId = isset($validated['revision_id']) ? (int) $validated['revision_id'] : null;
        $limit = (int) ($validated['limit'] ?? 5);

        if ($revisionId) {
            $revision = DrawingRevision::query()->findOrFail($revisionId);
            if ($revision->drawing_id !== $drawing->id || $revision->organization_id !== $drawing->organization_id) {
                abort(422, 'Selected revision does not belong to this drawing.');
            }
        }

        $zones = DrawingLocationZone::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->when($revisionId, function ($query) use ($revisionId): void {
                $query->where(function ($builder) use ($revisionId): void {
                    $builder->whereNull('drawing_revision_id')
                        ->orWhere('drawing_revision_id', $revisionId);
                });
            })
            ->with([
                'location:id,floor_id,name,code,barcode',
                'location.floor:id,building_id,name,code,level',
            ])
            ->get();

        $bestByLocation = [];
        foreach ($zones as $zone) {
            $location = $zone->location;
            if (! $location) {
                continue;
            }

            $inside = $zone->containsPoint($pinX, $pinY);
            $distance = $zone->distanceToPoint($pinX, $pinY);
            $baseScore = max(0.0, 1 - min(1.0, $distance * 4));
            $priorityWeight = min(0.25, ((int) $zone->priority) / 1000);
            $score = round($baseScore + ($inside ? 0.25 : 0) + $priorityWeight, 6);

            $candidate = [
                'location_id' => $location->id,
                'location_name' => $location->name,
                'location_code' => $location->code,
                'barcode' => $location->barcode,
                'inside_zone' => $inside,
                'distance' => round($distance, 6),
                'score' => $score,
                'source' => $inside ? 'zone_inside' : 'zone_nearest',
                'zone' => [
                    'id' => $zone->id,
                    'label' => $zone->zone_label,
                    'x_min' => $zone->x_min,
                    'y_min' => $zone->y_min,
                    'x_max' => $zone->x_max,
                    'y_max' => $zone->y_max,
                    'priority' => $zone->priority,
                ],
            ];

            $existing = $bestByLocation[$location->id] ?? null;
            if (! $existing) {
                $bestByLocation[$location->id] = $candidate;
                continue;
            }

            if ($candidate['inside_zone'] && ! $existing['inside_zone']) {
                $bestByLocation[$location->id] = $candidate;
                continue;
            }

            if ($candidate['inside_zone'] === $existing['inside_zone'] && $candidate['score'] > $existing['score']) {
                $bestByLocation[$location->id] = $candidate;
            }
        }

        $suggestions = collect($bestByLocation)
            ->values()
            ->sort(function (array $a, array $b): int {
                if ($a['inside_zone'] !== $b['inside_zone']) {
                    return $a['inside_zone'] ? -1 : 1;
                }

                if ($a['score'] !== $b['score']) {
                    return $a['score'] < $b['score'] ? 1 : -1;
                }

                return $a['distance'] <=> $b['distance'];
            })
            ->take($limit)
            ->values();

        if ($suggestions->isEmpty() && $drawing->floor_id) {
            $fallback = Location::query()
                ->where('organization_id', $drawing->organization_id)
                ->where('floor_id', $drawing->floor_id)
                ->orderBy('name')
                ->limit($limit)
                ->get(['id', 'name', 'code', 'barcode']);

            $suggestions = $fallback->map(fn (Location $location) => [
                'location_id' => $location->id,
                'location_name' => $location->name,
                'location_code' => $location->code,
                'barcode' => $location->barcode,
                'inside_zone' => false,
                'distance' => null,
                'score' => 0.05,
                'source' => 'floor_fallback',
                'zone' => null,
            ])->values();
        }

        return response()->json([
            'data' => [
                'pin' => [
                    'x' => $pinX,
                    'y' => $pinY,
                ],
                'suggested_location_id' => $suggestions->first()['location_id'] ?? null,
                'suggestions' => $suggestions,
            ],
        ]);
    }

    public function uploadRevision(Request $request, Drawing $drawing): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('update', $drawing);
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'revision_label' => ['required', 'string', 'max:50'],
            'file' => ['required', 'file', 'max:51200', 'mimes:pdf,jpeg,jpg,png,webp'],
            'notes' => ['nullable', 'string'],
            'pii_redacted' => ['nullable', 'boolean'],
            'set_current' => ['sometimes', 'boolean'],
        ]);

        $file = $validated['file'];
        try {
            $safe = $this->uploadSecurityService->assertSafeUploadedFile($file, [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ], 52428800);
            $compliance = $this->attachmentComplianceService->evaluate(
                $organization,
                (string) $file->getRealPath(),
                $safe['mime_type'],
                array_key_exists('pii_redacted', $validated) ? (bool) $validated['pii_redacted'] : null,
                'drawing_revision',
                ['drawing_id' => $drawing->id, 'project_id' => $drawing->project_id, 'file_name' => $file->getClientOriginalName()],
            );
            $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);
            $path = $file->store(
                sprintf('drawings/org_%d/project_%d/drawing_%d', $drawing->organization_id, $drawing->project_id, $drawing->id),
                'public'
            );
        } catch (\Throwable $exception) {
            $this->opsHealthService->recordStorageFailure(
                $drawing->organization_id,
                'drawing_revision',
                $exception->getMessage(),
                ['drawing_id' => $drawing->id, 'project_id' => $drawing->project_id]
            );
            throw $exception;
        }

        $revision = DrawingRevision::create([
            'organization_id' => $drawing->organization_id,
            'drawing_id' => $drawing->id,
            'revision_label' => $validated['revision_label'],
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'mime_type' => $safe['mime_type'],
            'file_size' => $safe['file_size'],
            'uploaded_by' => $request->user()->id,
            'notes' => $validated['notes'] ?? null,
            'security_meta' => $compliance,
            'is_current' => false,
        ]);

        $shouldSetCurrent = $validated['set_current']
            ?? ($drawing->current_revision_id === null);

        if ($shouldSetCurrent) {
            DrawingRevision::query()
                ->where('drawing_id', $drawing->id)
                ->update(['is_current' => false]);

            $revision->update(['is_current' => true]);
            $drawing->update(['current_revision_id' => $revision->id]);
        }

        return response()->json([
            'data' => $revision,
        ], 201);
    }

    public function setCurrentRevision(Request $request, Drawing $drawing, DrawingRevision $revision): JsonResponse
    {
        $this->assertOrganization($drawing->organization_id, $request);
        $this->authorize('update', $drawing);

        if ($revision->drawing_id !== $drawing->id || $revision->organization_id !== $drawing->organization_id) {
            abort(404);
        }

        DrawingRevision::query()
            ->where('drawing_id', $drawing->id)
            ->update(['is_current' => false]);

        $revision->update(['is_current' => true]);
        $drawing->update(['current_revision_id' => $revision->id]);

        return response()->json([
            'data' => $drawing->fresh(['currentRevision']),
        ]);
    }

    public function revisionFile(Request $request, DrawingRevision $revision)
    {
        $this->assertOrganization($revision->organization_id, $request);
        $drawing = Drawing::query()->findOrFail($revision->drawing_id);
        $this->authorize('view', $drawing);

        return Storage::disk('public')->response(
            $revision->file_path,
            $revision->file_name,
            ['Content-Type' => $revision->mime_type]
        );
    }

    /**
     * @return array{
     *     model: DrawingRevisionMapping,
     *     direction: string,
     *     transform_type: string,
     *     transform_params: array<string, mixed>
     * }|null
     */
    private function resolveMapping(Drawing $drawing, DrawingRevision $sourceRevision, DrawingRevision $targetRevision): ?array
    {
        $direct = DrawingRevisionMapping::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->where('from_revision_id', $sourceRevision->id)
            ->where('to_revision_id', $targetRevision->id)
            ->first();

        if ($direct) {
            return [
                'model' => $direct,
                'direction' => 'forward',
                'transform_type' => $direct->transform_type,
                'transform_params' => $direct->transform_params ?? [],
            ];
        }

        $reverse = DrawingRevisionMapping::query()
            ->where('organization_id', $drawing->organization_id)
            ->where('drawing_id', $drawing->id)
            ->where('from_revision_id', $targetRevision->id)
            ->where('to_revision_id', $sourceRevision->id)
            ->first();

        if (! $reverse) {
            return null;
        }

        $inverse = DrawingRevisionMapping::invertTransform(
            $reverse->transform_type,
            $reverse->transform_params ?? [],
        );

        if (! $inverse) {
            return null;
        }

        return [
            'model' => $reverse,
            'direction' => 'reverse',
            'transform_type' => $inverse['type'],
            'transform_params' => $inverse['params'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRevisionForComparison(DrawingRevision $revision, int $snagCount): array
    {
        return [
            'id' => $revision->id,
            'revision_label' => $revision->revision_label,
            'file_name' => $revision->file_name,
            'mime_type' => $revision->mime_type,
            'is_current' => (bool) $revision->is_current,
            'snag_count' => $snagCount,
            'file_url' => '/api/drawing-revisions/'.$revision->id.'/file',
        ];
    }
}

