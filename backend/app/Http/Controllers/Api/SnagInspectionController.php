<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\InspectionRequest;
use App\Models\Snag;
use App\Models\SnagInspection;
use App\Models\SnagInspectionAttachment;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SnagInspectionController extends Controller
{
    use InteractsWithOrganizationContext;

    private const WITH = [
        'equipment:id,name,code,category,status',
        'maintenanceCompany:id,name,code',
        'maintenanceTeam:id,name,code',
        'maintenanceUser:id,name,email',
        'inspector:id,name,email',
        'inspectionRequest:id,reference,title,status',
        'attachments',
    ];

    public function __construct(private readonly AccessControlService $accessControlService)
    {
    }

    public function index(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->assertReadAccess($request, $snag);

        $inspections = SnagInspection::query()
            ->where('snag_id', $snag->id)
            ->with(self::WITH)
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $inspections]);
    }

    public function store(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->assertWriteAccess($request, $snag);

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'max:60'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipments,id'],
            'asset_name' => ['nullable', 'string', 'max:255'],
            'create_asset' => ['nullable', 'boolean'],
            'asset_category' => ['nullable', 'string', 'max:120'],
            'maintenance_company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'maintenance_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'maintenance_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes' => ['nullable', 'string'],
            'inspection_request_id' => ['nullable', 'integer', 'exists:inspection_requests,id'],
            'inspected_at' => ['nullable', 'date'],
        ]);

        $organization = $this->currentOrganization($request);

        $equipmentId = $validated['equipment_id'] ?? null;
        $assetName = trim((string) ($validated['asset_name'] ?? ''));

        // Asset select-or-create: an existing Equipment resolves its name; a typed name
        // with create_asset mints a new Equipment so the asset is reportable; otherwise
        // the entered name is kept as free text.
        if ($equipmentId) {
            $equipment = Equipment::query()
                ->where('organization_id', $organization->id)
                ->findOrFail($equipmentId);
            if ($assetName === '') {
                $assetName = $equipment->name;
            }
        } elseif ($assetName !== '' && ! empty($validated['create_asset'])) {
            $equipment = Equipment::create([
                'organization_id' => $organization->id,
                'project_id' => $snag->project_id,
                'location_id' => $snag->location_id,
                'code' => $this->nextAssetCode($organization->id),
                'name' => $assetName,
                'category' => $validated['asset_category'] ?? null,
                'status' => 'ok',
            ]);
            $equipmentId = $equipment->id;
        }

        $inspection = SnagInspection::create([
            'organization_id' => $organization->id,
            'snag_id' => $snag->id,
            'inspection_request_id' => $validated['inspection_request_id'] ?? null,
            'reference' => $this->nextReference($organization->id),
            'status' => $validated['status'] ?? 'pending',
            'equipment_id' => $equipmentId,
            'asset_name' => $assetName !== '' ? $assetName : null,
            'maintenance_company_id' => $validated['maintenance_company_id'] ?? null,
            'maintenance_team_id' => $validated['maintenance_team_id'] ?? null,
            'maintenance_user_id' => $validated['maintenance_user_id'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'inspected_by' => $request->user()->id,
            'inspected_at' => $validated['inspected_at'] ?? now(),
            'created_by' => $request->user()->id,
        ]);

        // Recording the inspection completes the request it answers.
        if (! empty($validated['inspection_request_id'])) {
            InspectionRequest::query()
                ->where('organization_id', $organization->id)
                ->where('snag_id', $snag->id)
                ->whereKey($validated['inspection_request_id'])
                ->update([
                    'status' => InspectionRequest::STATUS_COMPLETED,
                    'completed_at' => now(),
                ]);
        }

        return response()->json(['data' => $inspection->load(self::WITH)], 201);
    }

    // Inspection requests raised on a snag (assigned to a responsible team/person).
    public function requests(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->assertReadAccess($request, $snag);

        $requests = InspectionRequest::query()
            ->where('snag_id', $snag->id)
            ->with(['team:id,name,code', 'assignee:id,name,email', 'requester:id,name'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $requests]);
    }

    public function requestInspection(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->assertWriteAccess($request, $snag);

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'stakeholder_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'scheduled_for' => ['nullable', 'date'],
        ]);

        if (empty($validated['stakeholder_team_id']) && empty($validated['assigned_to'])) {
            abort(422, 'Assign the inspection request to a team or a person.');
        }

        $organization = $this->currentOrganization($request);

        $inspectionRequest = InspectionRequest::create([
            'organization_id' => $organization->id,
            'project_id' => $snag->project_id,
            'snag_id' => $snag->id,
            'reference' => $this->nextRequestReference($organization->id),
            'request_type' => 'ir',
            'title' => $validated['title'] ?? ('Inspect '.($snag->reference ?? 'snag')),
            'description' => $validated['description'] ?? null,
            'status' => ! empty($validated['scheduled_for'])
                ? InspectionRequest::STATUS_SCHEDULED
                : InspectionRequest::STATUS_REQUESTED,
            'requested_by' => $request->user()->id,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'stakeholder_team_id' => $validated['stakeholder_team_id'] ?? null,
            'scheduled_for' => $validated['scheduled_for'] ?? null,
        ]);

        return response()->json([
            'data' => $inspectionRequest->load(['team:id,name,code', 'assignee:id,name,email', 'requester:id,name']),
        ], 201);
    }

    public function show(Request $request, SnagInspection $snagInspection): JsonResponse
    {
        $this->assertOrganization($snagInspection->organization_id, $request);
        $this->assertReadAccess($request, $snagInspection->snag);

        return response()->json(['data' => $snagInspection->load(self::WITH)]);
    }

    public function update(Request $request, SnagInspection $snagInspection): JsonResponse
    {
        $this->assertOrganization($snagInspection->organization_id, $request);
        $this->assertWriteAccess($request, $snagInspection->snag);

        $validated = $request->validate([
            'status' => ['sometimes', 'string', 'max:60'],
            'maintenance_company_id' => ['nullable', 'integer', 'exists:stakeholder_companies,id'],
            'maintenance_team_id' => ['nullable', 'integer', 'exists:stakeholder_teams,id'],
            'maintenance_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes' => ['nullable', 'string'],
        ]);

        $snagInspection->update($validated);

        return response()->json(['data' => $snagInspection->load(self::WITH)]);
    }

    public function storeAttachment(Request $request, SnagInspection $snagInspection): JsonResponse
    {
        $this->assertOrganization($snagInspection->organization_id, $request);
        $this->assertWriteAccess($request, $snagInspection->snag);

        $validated = $request->validate([
            'type' => ['required', 'in:photo,document'],
            'file' => ['required', 'file', 'max:51200', 'mimes:jpg,jpeg,png,webp,heic,pdf,doc,docx,xls,xlsx'],
        ]);

        $file = $request->file('file');
        $path = $file->store(
            sprintf('snag-inspections/org_%d/inspection_%d', $snagInspection->organization_id, $snagInspection->id),
            'public'
        );

        $attachment = SnagInspectionAttachment::create([
            'organization_id' => $snagInspection->organization_id,
            'snag_inspection_id' => $snagInspection->id,
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'],
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
        ]);

        return response()->json(['data' => $attachment], 201);
    }

    public function downloadAttachment(Request $request, SnagInspectionAttachment $attachment)
    {
        $this->assertOrganization($attachment->organization_id, $request);
        $this->assertReadAccess($request, $attachment->inspection->snag);

        abort_unless(Storage::disk('public')->exists($attachment->file_path), 404, 'File not found.');

        return Storage::disk('public')->download(
            $attachment->file_path,
            $attachment->file_name,
            ['Content-Type' => $attachment->mime_type ?? 'application/octet-stream'],
        );
    }

    private function assertReadAccess(Request $request, Snag $snag): void
    {
        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'snags.view')) {
            $this->denyWithPermissions($request, ['snags.view'], 'You do not have permission to view this snag.');
        }
    }

    private function assertWriteAccess(Request $request, Snag $snag): void
    {
        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'snags.comment')) {
            $this->denyWithPermissions($request, ['snags.comment'], 'You do not have permission to record an inspection on this snag.');
        }
    }

    private function nextReference(int $organizationId): string
    {
        $next = SnagInspection::query()->where('organization_id', $organizationId)->count() + 1;

        return 'SI-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    private function nextRequestReference(int $organizationId): string
    {
        $next = InspectionRequest::query()->where('organization_id', $organizationId)->whereNotNull('snag_id')->count() + 1;

        return 'SIR-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }

    private function nextAssetCode(int $organizationId): string
    {
        // Mint a unique asset code, retrying past any manually-created collisions.
        return DB::transaction(function () use ($organizationId): string {
            $sequence = Equipment::query()->where('organization_id', $organizationId)->count() + 1;
            do {
                $code = 'AST-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT);
                $sequence++;
            } while (Equipment::query()->where('organization_id', $organizationId)->where('code', $code)->exists());

            return $code;
        });
    }
}
