<?php

namespace App\Services;

use App\Models\MobileAttachmentUploadSession;
use App\Models\MobileSyncOperationLog;
use App\Models\OpsHealthEvent;
use App\Models\Organization;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class OpsHealthService
{
    public function recordSyncOperation(
        int $organizationId,
        ?int $userId,
        string $opId,
        string $operationType,
        string $status,
        ?array $payload = null,
        ?string $errorMessage = null,
    ): void {
        MobileSyncOperationLog::query()->create([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'op_id' => $opId,
            'operation_type' => $operationType,
            'status' => $status,
            'source' => 'apply',
            'error_code' => in_array($status, ['failed', 'rejected'], true) ? 'sync_error' : null,
            'error_message' => $errorMessage,
            'payload' => $payload,
            'occurred_at' => Carbon::now(),
        ]);
    }

    public function recordStorageFailure(
        ?int $organizationId,
        string $source,
        string $message,
        ?array $context = null,
        string $severity = 'error',
    ): void {
        OpsHealthEvent::query()->create([
            'organization_id' => $organizationId,
            'event_type' => 'storage_failure',
            'severity' => $severity,
            'source' => $source,
            'message' => $message,
            'context' => $context,
            'occurred_at' => Carbon::now(),
        ]);
    }

    public function recordApiLatencySample(
        int $organizationId,
        int $durationMs,
        int $statusCode,
        string $path,
        ?string $requestId = null,
        ?int $thresholdMs = null,
    ): void {
        OpsHealthEvent::query()->create([
            'organization_id' => $organizationId,
            'event_type' => 'api_latency_sample',
            'severity' => $statusCode >= 500 ? 'error' : ($statusCode >= 400 ? 'warning' : 'info'),
            'source' => 'api',
            'message' => sprintf('API latency sample for %s', $path),
            'context' => [
                'duration_ms' => $durationMs,
                'status_code' => $statusCode,
                'path' => $path,
                'request_id' => $requestId,
                'threshold_ms' => $thresholdMs,
            ],
            'occurred_at' => Carbon::now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboard(Organization $organization, int $hoursWindow = 24): array
    {
        $hours = max(1, min(168, $hoursWindow));
        $since = Carbon::now()->subHours($hours);

        $syncTotal = (int) MobileSyncOperationLog::query()
            ->where('organization_id', $organization->id)
            ->where('occurred_at', '>=', $since)
            ->count();
        $syncErrors = (int) MobileSyncOperationLog::query()
            ->where('organization_id', $organization->id)
            ->where('occurred_at', '>=', $since)
            ->whereIn('status', ['failed', 'rejected'])
            ->count();
        $syncErrorRate = $syncTotal > 0
            ? round(($syncErrors / $syncTotal) * 100, 2)
            : 0.0;

        $queueDepth = [
            'framework_jobs' => (int) DB::table('jobs')->count(),
            'framework_failed_jobs_last_24h' => (int) DB::table('failed_jobs')
                ->where('failed_at', '>=', Carbon::now()->subDay())
                ->count(),
            'exports_pending' => (int) DB::table('export_jobs')
                ->where('organization_id', $organization->id)
                ->whereIn('status', ['queued', 'processing'])
                ->count(),
            'exports_failed_last_24h' => (int) DB::table('export_jobs')
                ->where('organization_id', $organization->id)
                ->where('status', 'failed')
                ->where('updated_at', '>=', Carbon::now()->subDay())
                ->count(),
        ];

        $storageFailures = [
            'ops_events_last_24h' => (int) OpsHealthEvent::query()
                ->where('organization_id', $organization->id)
                ->where('event_type', 'storage_failure')
                ->where('occurred_at', '>=', Carbon::now()->subDay())
                ->count(),
            'mobile_upload_failed_last_24h' => (int) MobileAttachmentUploadSession::query()
                ->where('organization_id', $organization->id)
                ->where('status', 'failed')
                ->where('updated_at', '>=', Carbon::now()->subDay())
                ->count(),
            'recent' => OpsHealthEvent::query()
                ->where('organization_id', $organization->id)
                ->where('event_type', 'storage_failure')
                ->orderByDesc('occurred_at')
                ->limit(10)
                ->get(['source', 'message', 'severity', 'occurred_at', 'context'])
                ->map(fn (OpsHealthEvent $event) => [
                    'source' => $event->source,
                    'message' => $event->message,
                    'severity' => $event->severity,
                    'occurred_at' => optional($event->occurred_at)->toISOString(),
                    'context' => $event->context,
                ])
                ->values()
                ->all(),
        ];

        $syncByStatus = MobileSyncOperationLog::query()
            ->where('organization_id', $organization->id)
            ->where('occurred_at', '>=', $since)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn ($total) => (int) $total)
            ->all();

        $uniqueOperationCount = (int) MobileSyncOperationLog::query()
            ->where('organization_id', $organization->id)
            ->where('occurred_at', '>=', $since)
            ->distinct('op_id')
            ->count('op_id');

        $retriedOperationCount = (int) DB::table('mobile_sync_operation_logs')
            ->where('organization_id', $organization->id)
            ->where('occurred_at', '>=', $since)
            ->groupBy('op_id')
            ->havingRaw('COUNT(*) > 1')
            ->get(['op_id'])
            ->count();

        $syncRetryRate = $uniqueOperationCount > 0
            ? round(($retriedOperationCount / $uniqueOperationCount) * 100, 2)
            : 0.0;

        $apiLatencySamples = OpsHealthEvent::query()
            ->where('organization_id', $organization->id)
            ->where('event_type', 'api_latency_sample')
            ->where('occurred_at', '>=', $since)
            ->orderBy('occurred_at')
            ->get(['context']);

        $durations = $apiLatencySamples
            ->map(function (OpsHealthEvent $event): ?int {
                $context = is_array($event->context) ? $event->context : [];
                $duration = $context['duration_ms'] ?? null;

                return is_numeric($duration) ? (int) $duration : null;
            })
            ->filter(fn (?int $duration) => $duration !== null)
            ->sort()
            ->values();

        $p95ApiLatencyMs = null;
        if ($durations->count() > 0) {
            $index = (int) ceil(($durations->count() * 0.95) - 1);
            $index = max(0, min($index, $durations->count() - 1));
            $p95ApiLatencyMs = $durations[$index];
        }

        $requestErrorRate = null;
        if ($apiLatencySamples->count() > 0) {
            $errored = $apiLatencySamples
                ->filter(function (OpsHealthEvent $event): bool {
                    $context = is_array($event->context) ? $event->context : [];
                    $statusCode = $context['status_code'] ?? null;

                    return is_numeric($statusCode) && (int) $statusCode >= 400;
                })
                ->count();
            $requestErrorRate = round(($errored / $apiLatencySamples->count()) * 100, 2);
        }

        $websocketFailuresLast24h = (int) OpsHealthEvent::query()
            ->where('organization_id', $organization->id)
            ->where('event_type', 'websocket_delivery_failure')
            ->where('occurred_at', '>=', Carbon::now()->subDay())
            ->count();

        return [
            'window_hours' => $hours,
            'sync' => [
                'total_operations' => $syncTotal,
                'error_operations' => $syncErrors,
                'error_rate_percent' => $syncErrorRate,
                'retry_rate_percent' => $syncRetryRate,
                'by_status' => $syncByStatus,
            ],
            'request_error_rate' => $requestErrorRate,
            'p95_api_latency_ms' => $p95ApiLatencyMs,
            'sync_retry_rate' => $syncRetryRate,
            'websocket_delivery_failures_last_24h' => $websocketFailuresLast24h,
            'queue_depth' => $queueDepth,
            'storage_failures' => $storageFailures,
        ];
    }
}
