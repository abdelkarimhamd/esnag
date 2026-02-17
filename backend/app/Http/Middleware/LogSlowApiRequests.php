<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class LogSlowApiRequests
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $response = $next($request);
        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

        if ($request->is('api/*') && $durationMs >= 800) {
            Log::warning('Slow API request detected', [
                'method' => $request->method(),
                'path' => $request->path(),
                'route' => optional($request->route())->getName(),
                'status' => $response->getStatusCode(),
                'duration_ms' => $durationMs,
                'user_id' => $request->user()?->id,
                'organization_id' => $request->header('X-Organization-Id'),
                'ip' => $request->ip(),
            ]);
        }

        return $response;
    }
}
