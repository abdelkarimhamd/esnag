<?php

namespace App\Http\Controllers\Api;

use App\Events\ExportRequested;
use App\Events\ExportRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\ExportJob;
use App\Models\Project;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ExportController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('exports.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $query = ExportJob::query()
            ->where('organization_id', $organization->id)
            ->with(['requester:id,name,email', 'project:id,name,code'])
            ->orderByDesc('created_at');

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        $jobs = $query->paginate($perPage);

        return response()->json($jobs);
    }

    public function __construct(
        private readonly UsageLimitService $usageLimitService,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        if (! $request->user()->can('exports.request')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $this->usageLimitService->assertCanRequestExport($organization);

        $validated = $request->validate([
            'type' => ['required', 'in:pdf,csv,xlsx'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'filters' => ['nullable', 'array'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $exportJob = ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $request->user()->id,
            'project_id' => $validated['project_id'] ?? null,
            'type' => $validated['type'],
            'status' => 'queued',
            'filters' => $validated['filters'] ?? null,
            'download_token' => Str::random(40),
        ]);

        event(new ExportRequested($exportJob));
        event(new ExportRealtimeMessage($organization->id, [
            'action' => 'export_requested',
            'export_job_id' => $exportJob->id,
            'status' => $exportJob->status,
            'type' => $exportJob->type,
        ]));

        return response()->json([
            'data' => $exportJob->fresh(['requester:id,name,email', 'project:id,name,code']),
        ], 201);
    }

    public function show(Request $request, ExportJob $exportJob): JsonResponse
    {
        $this->assertOrganization($exportJob->organization_id, $request);

        if (! $request->user()->can('exports.view')) {
            abort(403);
        }

        return response()->json([
            'data' => $exportJob->load(['requester:id,name,email', 'project:id,name,code']),
        ]);
    }

    public function download(Request $request, ExportJob $exportJob)
    {
        $this->assertOrganization($exportJob->organization_id, $request);

        if (! $request->user()->can('exports.download')) {
            abort(403);
        }

        if ($exportJob->status !== 'completed' || ! $exportJob->file_path) {
            abort(422, 'Export is not ready for download.');
        }

        if (! Storage::disk('public')->exists($exportJob->file_path)) {
            abort(404, 'Export file not found.');
        }

        return Storage::disk('public')->download(
            $exportJob->file_path,
            $exportJob->file_name ?? basename($exportJob->file_path),
            ['Content-Type' => $exportJob->mime_type ?? 'application/octet-stream']
        );
    }

    public function signedDownload(Request $request, ExportJob $exportJob)
    {
        if ($exportJob->status !== 'completed' || ! $exportJob->file_path) {
            abort(404);
        }

        if (! Storage::disk('public')->exists($exportJob->file_path)) {
            abort(404);
        }

        return Storage::disk('public')->download(
            $exportJob->file_path,
            $exportJob->file_name ?? basename($exportJob->file_path),
            ['Content-Type' => $exportJob->mime_type ?? 'application/octet-stream']
        );
    }
}
