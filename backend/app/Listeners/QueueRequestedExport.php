<?php

namespace App\Listeners;

use App\Events\ExportRequested;
use App\Jobs\GenerateExportFileJob;

class QueueRequestedExport
{
    public function handle(ExportRequested $event): void
    {
        GenerateExportFileJob::dispatch($event->exportJob->id);
    }
}
