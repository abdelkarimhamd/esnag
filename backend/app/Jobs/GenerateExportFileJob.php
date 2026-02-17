<?php

namespace App\Jobs;

use App\Events\ExportRealtimeMessage;
use App\Exports\InspectionArrayExport;
use App\Exports\SnagsArrayExport;
use App\Models\ExportJob;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\Snag;
use App\Notifications\ExportFailedNotification;
use App\Notifications\ExportReadyNotification;
use App\Services\PushNotificationService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Facades\Excel;

class GenerateExportFileJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public function __construct(
        public readonly int $exportJobId,
    ) {
    }

    public function handle(): void
    {
        $exportJob = ExportJob::query()->with('requester')->find($this->exportJobId);

        if (! $exportJob) {
            return;
        }

        $exportJob->update([
            'status' => 'processing',
            'error_message' => null,
        ]);

        try {
            [$rows, $headings, $module] = $this->buildRows($exportJob);
            $timestamp = Carbon::now()->format('Ymd_His');
            $basePath = sprintf('exports/org_%d/export_%d_%s', $exportJob->organization_id, $exportJob->id, $timestamp);

            [$path, $fileName, $mimeType] = match ($exportJob->type) {
                'csv' => $this->generateSpreadsheet($module, $rows, $headings, $basePath.'.csv', 'text/csv', \Maatwebsite\Excel\Excel::CSV),
                'xlsx' => $this->generateSpreadsheet(
                    $module,
                    $rows,
                    $headings,
                    $basePath.'.xlsx',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    \Maatwebsite\Excel\Excel::XLSX
                ),
                'pdf' => $this->generatePdf($module, $rows, $headings, $basePath.'.pdf'),
                default => throw new \RuntimeException('Unsupported export type: '.$exportJob->type),
            };

            $exportJob->update([
                'status' => 'completed',
                'file_path' => $path,
                'file_name' => basename($fileName),
                'mime_type' => $mimeType,
                'download_token' => Str::random(40),
                'completed_at' => Carbon::now(),
            ]);

            $fresh = $exportJob->fresh();
            $fresh->requester?->notify(new ExportReadyNotification($fresh));
            if ($fresh->requester) {
                app(PushNotificationService::class)->sendToUsers(
                    $fresh->organization_id,
                    [$fresh->requester],
                    'Export Ready',
                    strtoupper($fresh->type).' export is ready to download.',
                    'esnagging://exports/'.$fresh->id,
                    [
                        'type' => 'export_ready',
                        'export_job_id' => $fresh->id,
                        'organization_id' => $fresh->organization_id,
                    ],
                );
            }

            event(new ExportRealtimeMessage($fresh->organization_id, [
                'action' => 'export_completed',
                'export_job_id' => $fresh->id,
                'status' => $fresh->status,
                'type' => $fresh->type,
                'download_url' => $fresh->download_url,
            ]));
        } catch (\Throwable $exception) {
            report($exception);

            $exportJob->update([
                'status' => 'failed',
                'error_message' => Str::limit($exception->getMessage(), 1000),
                'completed_at' => Carbon::now(),
            ]);

            $fresh = $exportJob->fresh();
            $fresh->requester?->notify(new ExportFailedNotification($fresh));
            if ($fresh->requester) {
                app(PushNotificationService::class)->sendToUsers(
                    $fresh->organization_id,
                    [$fresh->requester],
                    'Export Failed',
                    'Export generation failed. Please retry.',
                    'esnagging://exports/'.$fresh->id,
                    [
                        'type' => 'export_failed',
                        'export_job_id' => $fresh->id,
                        'organization_id' => $fresh->organization_id,
                    ],
                );
            }

            event(new ExportRealtimeMessage($fresh->organization_id, [
                'action' => 'export_failed',
                'export_job_id' => $fresh->id,
                'status' => $fresh->status,
                'type' => $fresh->type,
                'error_message' => $fresh->error_message,
            ]));
        }
    }

    /**
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, string>, 2: string}
     */
    private function buildRows(ExportJob $exportJob): array
    {
        $filters = $exportJob->filters ?? [];
        $module = strtolower((string) ($filters['module'] ?? 'snags'));

        if ($module === 'inspections') {
            return $this->buildInspectionRows($exportJob, $filters);
        }

        return $this->buildSnagRows($exportJob, $filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, string>, 2: string}
     */
    private function buildSnagRows(ExportJob $exportJob, array $filters): array
    {

        $query = Snag::query()
            ->where('organization_id', $exportJob->organization_id)
            ->with([
                'project:id,name,code',
                'drawing:id,code,title',
                'assignee:id,name,email',
                'closeoutInstance.template:id,trade',
            ])
            ->orderByDesc('created_at');

        if ($exportJob->project_id) {
            $query->where('project_id', $exportJob->project_id);
        }

        if (! empty($filters['snag_ids']) && is_array($filters['snag_ids'])) {
            $snagIds = collect($filters['snag_ids'])
                ->map(fn ($value) => (int) $value)
                ->filter(fn (int $value) => $value > 0)
                ->unique()
                ->values()
                ->all();

            if ($snagIds !== []) {
                $query->whereIn('id', $snagIds);
            }
        }

        if (! empty($filters['status'])) {
            $statuses = is_array($filters['status']) ? $filters['status'] : [$filters['status']];
            $query->whereIn('status', $statuses);
        }

        if (! empty($filters['priority'])) {
            $priorities = is_array($filters['priority']) ? $filters['priority'] : [$filters['priority']];
            $query->whereIn('priority', $priorities);
        }

        if (! empty($filters['assigned_to'])) {
            $query->where('assigned_to', (int) $filters['assigned_to']);
        }

        if (! empty($filters['date_from'])) {
            $query->whereDate('created_at', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('created_at', '<=', $filters['date_to']);
        }

        $snags = $query->get();

        $rows = $snags->map(function (Snag $snag): array {
            return [
                'reference' => $snag->reference,
                'title' => $snag->title,
                'status' => $this->translateStatusBilingual($snag->status),
                'priority' => $this->translatePriorityBilingual($snag->priority),
                'project' => $snag->project?->name ?? '-',
                'drawing' => $snag->drawing?->code ?? '-',
                'assignee' => $snag->assignee?->name ?? 'Unassigned / غير معيّن',
                'trade' => $snag->closeoutInstance?->template?->trade ?? 'Unspecified',
                'closeout_completion' => $snag->closeoutInstance?->completion_percentage ?? 0,
                'due_date' => optional($snag->due_date)->toDateString() ?? '-',
                'closed_at' => optional($snag->closed_at)->toDateTimeString() ?? '-',
                'created_at' => optional($snag->created_at)->toDateTimeString() ?? '-',
            ];
        })->values()->all();

        $headings = SnagsArrayExport::defaultHeadings();

        return [$rows, $headings, 'snags'];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, string>, 2: string}
     */
    private function buildInspectionRows(ExportJob $exportJob, array $filters): array
    {
        $query = InspectionSubmission::query()
            ->where('organization_id', $exportJob->organization_id)
            ->with([
                'template:id,name,type',
                'project:id,name,code',
                'creator:id,name,email',
                'submitter:id,name,email',
                'approvals:id,inspection_submission_id,status,step_order,step_name',
                'signatures:id,inspection_submission_id',
                'requests:id,inspection_submission_id,status',
            ])
            ->orderByDesc('created_at');

        if ($exportJob->project_id) {
            $query->where('project_id', $exportJob->project_id);
        }

        if (! empty($filters['status'])) {
            $statuses = is_array($filters['status']) ? $filters['status'] : [$filters['status']];
            $query->whereIn('status', $statuses);
        }

        if (! empty($filters['type'])) {
            $types = is_array($filters['type']) ? $filters['type'] : [$filters['type']];
            $query->whereHas('template', fn ($builder) => $builder->whereIn('type', $types));
        }

        if (! empty($filters['date_from'])) {
            $query->whereDate('created_at', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('created_at', '<=', $filters['date_to']);
        }

        $submissions = $query->get();

        $rows = $submissions->map(function (InspectionSubmission $submission): array {
            $approvalTotal = $submission->approvals->count();
            $approved = $submission->approvals->where('status', 'approved')->count();
            $pendingStep = $submission->approvals
                ->where('status', 'pending')
                ->sortBy('step_order')
                ->first();
            $openRequests = $submission->requests
                ->whereIn('status', [
                    InspectionRequest::STATUS_REQUESTED,
                    InspectionRequest::STATUS_SCHEDULED,
                    InspectionRequest::STATUS_IN_PROGRESS,
                ])
                ->count();

            return [
                'reference' => $submission->reference,
                'template' => $submission->template?->name ?? '-',
                'type' => $this->translateInspectionTypeBilingual($submission->template?->type),
                'status' => $this->translateInspectionStatusBilingual($submission->status),
                'project' => $submission->project?->name ?? '-',
                'submitted_by' => $submission->submitter?->name ?? ($submission->creator?->name ?? '-'),
                'current_step' => $pendingStep?->step_name ?? ($pendingStep ? 'Step '.$pendingStep->step_order : '-'),
                'approvals' => sprintf('%d/%d', $approved, $approvalTotal),
                'signatures' => $submission->signatures->count(),
                'open_requests' => $openRequests,
                'submitted_at' => optional($submission->submitted_at)->toDateTimeString() ?? '-',
                'approved_at' => optional($submission->approved_at)->toDateTimeString() ?? '-',
                'created_at' => optional($submission->created_at)->toDateTimeString() ?? '-',
            ];
        })->values()->all();

        $headings = InspectionArrayExport::defaultHeadings();

        return [$rows, $headings, 'inspections'];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<int, string>  $headings
     * @return array{0: string, 1: string, 2: string}
     */
    private function generateSpreadsheet(string $module, array $rows, array $headings, string $path, string $mimeType, string $writerType): array
    {
        $export = $module === 'inspections'
            ? new InspectionArrayExport($rows, $headings)
            : new SnagsArrayExport($rows, $headings);

        Excel::store($export, $path, 'public', $writerType);

        return [$path, $path, $mimeType];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<int, string>  $headings
     * @return array{0: string, 1: string, 2: string}
     */
    private function generatePdf(string $module, array $rows, array $headings, string $path): array
    {
        $view = $module === 'inspections' ? 'exports.inspections' : 'exports.snags';
        $title = $module === 'inspections'
            ? 'Inspections Export / تصدير الفحوصات'
            : 'Snags Export / تصدير الملاحظات';

        $pdf = Pdf::loadView($view, [
            'rows' => $rows,
            'headings' => $headings,
            'title' => $title,
            'generatedAt' => Carbon::now()->toDateTimeString(),
        ])->setPaper('a4', 'landscape');

        Storage::disk('public')->put($path, $pdf->output());

        return [$path, $path, 'application/pdf'];
    }

    private function translateStatusBilingual(string $status): string
    {
        return match ($status) {
            'new' => 'New / جديد',
            'assigned' => 'Assigned / مُعيّن',
            'in_progress' => 'In Progress / قيد التنفيذ',
            'ready_for_review' => 'Ready for Review / جاهز للمراجعة',
            'closed' => 'Closed / مغلق',
            'rejected' => 'Rejected / مرفوض',
            default => $status,
        };
    }

    private function translatePriorityBilingual(string $priority): string
    {
        return match ($priority) {
            'low' => 'Low / منخفض',
            'medium' => 'Medium / متوسط',
            'high' => 'High / مرتفع',
            'critical' => 'Critical / حرج',
            default => $priority,
        };
    }

    private function translateInspectionTypeBilingual(?string $type): string
    {
        $normalized = strtolower((string) ($type ?? ''));

        return match ($normalized) {
            'ncr' => 'NCR / تقرير عدم مطابقة',
            'rfi' => 'RFI / طلب معلومات',
            'safety' => 'Safety / سلامة',
            'permit' => 'Permit / تصريح',
            'commissioning' => 'Commissioning / تشغيل تجريبي',
            'checklist' => 'Checklist / قائمة تحقق',
            'handover' => 'Handover / تسليم',
            'mir' => 'MIR / طلب فحص مواد',
            'wir' => 'WIR / طلب فحص أعمال',
            'ir' => 'IR / طلب فحص',
            default => $type ?: '-',
        };
    }

    private function translateInspectionStatusBilingual(string $status): string
    {
        return match ($status) {
            'draft' => 'Draft / مسودة',
            'submitted' => 'Submitted / مُرسل',
            'in_review' => 'In Review / قيد المراجعة',
            'approved' => 'Approved / مُعتمد',
            'rejected' => 'Rejected / مرفوض',
            default => $status,
        };
    }
}
