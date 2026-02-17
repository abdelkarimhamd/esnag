<?php

namespace App\Providers;

use App\Events\ExportRequested;
use App\Events\SnagCreated;
use App\Events\SnagStatusChanged;
use App\Listeners\HandleSnagCreated;
use App\Listeners\HandleSnagStatusChanged;
use App\Listeners\QueueRequestedExport;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

class EventServiceProvider extends ServiceProvider
{
    /**
     * @var array<class-string, array<int, class-string>>
     */
    protected $listen = [
        SnagCreated::class => [
            HandleSnagCreated::class,
        ],
        SnagStatusChanged::class => [
            HandleSnagStatusChanged::class,
        ],
        ExportRequested::class => [
            QueueRequestedExport::class,
        ],
    ];
}

