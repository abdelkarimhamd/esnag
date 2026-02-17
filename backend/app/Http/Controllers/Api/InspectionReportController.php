<?php

namespace App\Http\Controllers\Api;

use App\Events\ExportRequested;
use App\Events\ExportRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\ExportJob;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class InspectionReportController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('inspections.reports.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));
        $cacheKey = sprintf(
            'inspection_reports:org:%d:user:%d:%s',
            $organization->id,
            $request->user()->id,
            sha1(json_encode([
                'project_id' => $request->integer('project_id'),
                'type' => $request->string('type')->toString(),
                'page' => $request->integer('page', 1),
                'per_page' => $perPage,
            ]) ?: '')
        );

        $payload = Cache::remember($cacheKey, now()->addSeconds(30), function () use ($organization, $request, $perPage): array {
            $baseSubmissions = InspectionSubmission::query()
                ->where('organization_id', $organization->id);

            $baseRequests = InspectionRequest::query()
                ->where('organization_id', $organization->id);

            if ($projectId = $request->integer('project_id')) {
                $baseSubmissions->where('project_id', $projectId);
                $baseRequests->where('project_id', $projectId);
            }

            if ($type = $request->string('type')->toString()) {
                $baseSubmissions->whereHas('template', fn ($query) => $query->where('type', $type));
            }

            $statusCounts = (clone $baseSubmissions)
                ->selectRaw('status, COUNT(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status');

            $typeCounts = (clone $baseSubmissions)
                ->with('template:id,type')
                ->get()
                ->map(fn (InspectionSubmission $submission) => $submission->template?->type ?: 'unknown')
                ->countBy();

            $requestStatusCounts = (clone $baseRequests)
                ->selectRaw('status, COUNT(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status');

            $submissions = (clone $baseSubmissions)
                ->with(['template:id,name,type', 'project:id,name,code', 'creator:id,name,email'])
                ->orderByDesc('created_at')
                ->paginate($perPage);

            return [
                'summary' => [
                    'total_submissions' => (clone $baseSubmissions)->count(),
                    'approved_submissions' => (clone $baseSubmissions)->where('status', InspectionSubmission::STATUS_APPROVED)->count(),
                    'in_review_submissions' => (clone $baseSubmissions)->where('status', InspectionSubmission::STATUS_IN_REVIEW)->count(),
                    'rejected_submissions' => (clone $baseSubmissions)->where('status', InspectionSubmission::STATUS_REJECTED)->count(),
                    'open_requests' => (clone $baseRequests)->whereNotIn('status', [InspectionRequest::STATUS_COMPLETED, InspectionRequest::STATUS_CANCELLED])->count(),
                ],
                'status_breakdown' => $statusCounts,
                'type_breakdown' => $typeCounts,
                'request_status_breakdown' => $requestStatusCounts,
                'submissions' => $submissions->toArray(),
            ];
        });

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        if (! $request->user()->can('inspections.reports.export')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'type' => ['required', 'in:pdf,csv,xlsx'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'filters' => ['nullable', 'array'],
        ]);

        if (! empty($validated['project_id'])) {
            $project = Project::query()->findOrFail($validated['project_id']);
            $this->assertOrganization($project->organization_id, $request);
        }

        $filters = $validated['filters'] ?? [];
        $filters['module'] = 'inspections';

        $exportJob = ExportJob::query()->create([
            'organization_id' => $organization->id,
            'requested_by' => $request->user()->id,
            'project_id' => $validated['project_id'] ?? null,
            'type' => $validated['type'],
            'status' => 'queued',
            'filters' => $filters,
            'download_token' => Str::random(40),
        ]);

        event(new ExportRequested($exportJob));
        event(new ExportRealtimeMessage($organization->id, [
            'action' => 'inspection_export_requested',
            'export_job_id' => $exportJob->id,
            'status' => $exportJob->status,
            'type' => $exportJob->type,
        ]));

        return response()->json([
            'data' => $exportJob->fresh(['requester:id,name,email', 'project:id,name,code']),
        ], 201);
    }
}
