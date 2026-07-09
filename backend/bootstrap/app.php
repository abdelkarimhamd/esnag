<?php

use App\Http\Middleware\EnsureOrganizationContext;
use App\Http\Middleware\EnsureFeatureEnabled;
use App\Http\Middleware\EnsureTenantIpAllowed;
use App\Http\Middleware\EnsureTrainingProjectWritable;
use App\Http\Middleware\AttachRequestContext;
use App\Http\Middleware\LogSlowApiRequests;
use App\Support\RequestContext;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\JsonResponse;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        channels: __DIR__.'/../routes/channels.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->prependToGroup('api', AttachRequestContext::class);
        $middleware->appendToGroup('api', LogSlowApiRequests::class);

        $middleware->alias([
            'organization' => EnsureOrganizationContext::class,
            'feature' => EnsureFeatureEnabled::class,
            'tenant.ip' => EnsureTenantIpAllowed::class,
            'training.writable' => EnsureTrainingProjectWritable::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(function (Response $response): Response {
            $request = request();

            if (! $request || ! $request->is('api/*') || $response->getStatusCode() < 400) {
                return $response;
            }

            $statusCode = $response->getStatusCode();
            $defaultCode = match (true) {
                $statusCode === 401 => 'unauthorized',
                $statusCode === 403 => 'forbidden',
                $statusCode === 404 => 'not_found',
                $statusCode === 409 => 'conflict',
                $statusCode === 422 => 'validation_failed',
                $statusCode === 429 => 'rate_limited',
                $statusCode >= 500 => 'server_error',
                default => 'request_failed',
            };

            $requestId = RequestContext::getRequestId($request);
            if (is_string($requestId) && $requestId !== '') {
                $response->headers->set('X-Request-Id', $requestId);
            }

            if (! ($response instanceof JsonResponse)) {
                return $response;
            }

            $payload = $response->getData(true);
            if (! is_array($payload)) {
                return $response;
            }

            if (! array_key_exists('message', $payload) || ! is_string($payload['message']) || trim($payload['message']) === '') {
                $payload['message'] = Response::$statusTexts[$statusCode] ?? 'Request failed.';
            }

            if (! array_key_exists('code', $payload) || ! is_string($payload['code']) || trim($payload['code']) === '') {
                $payload['code'] = $defaultCode;
            }

            if (is_string($requestId) && $requestId !== '' && ! array_key_exists('request_id', $payload)) {
                $payload['request_id'] = $requestId;
            }

            if (($payload['code'] ?? null) === 'forbidden' && ! array_key_exists('required_permissions', $payload)) {
                $requiredPermissions = $request->attributes->get('required_permissions');
                if (is_array($requiredPermissions) && $requiredPermissions !== []) {
                    $payload['required_permissions'] = array_values(array_unique(array_map('strval', $requiredPermissions)));
                }
            }

            if (! array_key_exists('hint', $payload)) {
                $payload['hint'] = match ($payload['code']) {
                    'unauthorized' => 'Sign in again to continue.',
                    'forbidden' => 'You need additional permission to perform this action.',
                    'validation_failed' => 'Review the highlighted fields and try again.',
                    'conflict' => 'Refresh your data and retry the action.',
                    'rate_limited' => 'Too many requests in a short time. Please wait and retry.',
                    'server_error' => 'Please retry. If the issue persists, contact support with the request reference.',
                    default => null,
                };
            }

            if (! array_key_exists('action', $payload)) {
                $payload['action'] = match ($payload['code']) {
                    'unauthorized' => 'login',
                    'forbidden' => 'request_access',
                    'validation_failed' => 'fix_fields',
                    'conflict' => 'refresh_and_retry',
                    'rate_limited' => 'retry_later',
                    'server_error' => 'contact_support',
                    default => null,
                };
            }

            $response->setData($payload);

            return $response;
        });
    })->create();

