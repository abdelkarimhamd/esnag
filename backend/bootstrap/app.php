<?php

use App\Http\Middleware\EnsureOrganizationContext;
use App\Http\Middleware\EnsureFeatureEnabled;
use App\Http\Middleware\EnsureTenantIpAllowed;
use App\Http\Middleware\EnsureTrainingProjectWritable;
use App\Http\Middleware\LogSlowApiRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

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
        $middleware->appendToGroup('api', LogSlowApiRequests::class);

        $middleware->alias([
            'organization' => EnsureOrganizationContext::class,
            'feature' => EnsureFeatureEnabled::class,
            'tenant.ip' => EnsureTenantIpAllowed::class,
            'training.writable' => EnsureTrainingProjectWritable::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();

