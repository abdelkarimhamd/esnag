<?php

namespace App\Http\Middleware;

use App\Services\OpsHealthService;
use App\Support\RequestContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class LogSlowApiRequests
{
    public function __construct(
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $response = $next($request);

        if ($request->is('api/*')) {
            $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
            $thresholdMs = (int) config('observability.slow_request_threshold_ms');
            $organizationId = $request->header('X-Organization-Id');

            // Only slow requests get the warning log line...
            if ($durationMs >= $thresholdMs) {
                Log::channel('api')->warning('Slow API request detected', [
                    'request_id' => RequestContext::getRequestId($request),
                    'method' => $request->method(),
                    'path' => $request->path(),
                    'route' => optional($request->route())->getName(),
                    'status' => $response->getStatusCode(),
                    'duration_ms' => $durationMs,
                    'threshold_ms' => $thresholdMs,
                    'user_id' => $request->user()?->id,
                    'organization_id' => $organizationId,
                    'ip' => $request->ip(),
                ]);
            }

            // ...but EVERY org-scoped api request is sampled, so the dashboard's
            // p95_api_latency_ms and request_error_rate reflect all traffic rather
            // than a slow-only biased subset. Telemetry must never break the request.
            if (is_numeric($organizationId) && (int) $organizationId > 0) {
                try {
                    $this->opsHealthService->recordApiLatencySample(
                        (int) $organizationId,
                        $durationMs,
                        $response->getStatusCode(),
                        $request->path(),
                        RequestContext::getRequestId($request),
                        $thresholdMs,
                    );
                } catch (Throwable $exception) {
                    Log::channel('api')->warning('Failed to record API latency sample', [
                        'request_id' => RequestContext::getRequestId($request),
                        'message' => $exception->getMessage(),
                    ]);
                }
            }
        }

        return $response;
    }
}
