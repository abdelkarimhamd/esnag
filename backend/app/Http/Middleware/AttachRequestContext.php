<?php

namespace App\Http\Middleware;

use App\Support\RequestContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AttachRequestContext
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = RequestContext::resolveRequestId($request);
        $request->attributes->set(RequestContext::REQUEST_ID_ATTRIBUTE, $requestId);

        // Note: this middleware is prepended to the api group, so it runs BEFORE
        // auth:sanctum resolves the user. user_id is intentionally omitted here (it
        // would always be null); it is added to the shared context by the
        // Authenticated event listener in AppServiceProvider once auth resolves, and
        // the per-request completion log below reads it directly post-controller.
        Log::withContext([
            'request_id' => $requestId,
            'method' => $request->method(),
            'path' => $request->path(),
            'route' => optional($request->route())->getName(),
            'organization_id' => $request->header('X-Organization-Id'),
            'project_id' => $this->resolveProjectId($request),
            'ip' => $request->ip(),
        ]);

        $startedAt = microtime(true);

        try {
            $response = $next($request);
        } catch (Throwable $exception) {
            Log::channel('api')->error('Unhandled API exception', [
                'request_id' => $requestId,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            throw $exception;
        }

        if ($request->is('api/*')) {
            $response->headers->set('X-Request-Id', $requestId);

            if ((bool) config('observability.request_log_enabled')) {
                $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
                $status = $response->getStatusCode();
                $errorCode = null;
                if ($status >= 400 && $response instanceof \Symfony\Component\HttpFoundation\JsonResponse) {
                    $payload = $response->getData(true);
                    if (is_array($payload) && isset($payload['code']) && is_string($payload['code'])) {
                        $errorCode = $payload['code'];
                    }
                }
                $logPayload = [
                    'request_id' => $requestId,
                    'status' => $status,
                    'duration_ms' => $durationMs,
                    'user_id' => $request->user()?->id,
                    'organization_id' => $request->header('X-Organization-Id'),
                    'project_id' => $this->resolveProjectId($request),
                    'ip' => $request->ip(),
                    'route' => optional($request->route())->getName(),
                    'error_code' => $errorCode,
                ];

                if ($status >= 500) {
                    Log::channel('api')->error('API request failed', $logPayload);
                } elseif ($status >= 400) {
                    Log::channel('api')->warning('API request warning', $logPayload);
                } elseif ((bool) config('observability.request_log_include_success')) {
                    Log::channel('api')->info('API request completed', $logPayload);
                }
            }
        }

        return $response;
    }

    private function resolveProjectId(Request $request): ?int
    {
        if ($request->filled('project_id')) {
            $projectId = $request->integer('project_id');
            if ($projectId > 0) {
                return $projectId;
            }
        }

        foreach ([
            'project',
            'drawing',
            'snag',
            'equipment',
            'inspectionTemplate',
            'inspectionSubmission',
            'inspectionRequest',
            'team',
        ] as $routeKey) {
            $routeValue = $request->route($routeKey);
            if (! $routeValue) {
                continue;
            }

            if (is_object($routeValue) && isset($routeValue->project_id) && $routeValue->project_id) {
                return (int) $routeValue->project_id;
            }

            if ($routeKey === 'project' && is_numeric($routeValue)) {
                return (int) $routeValue;
            }

            if ($routeKey === 'project' && is_object($routeValue) && isset($routeValue->id)) {
                return (int) $routeValue->id;
            }
        }

        return null;
    }
}
