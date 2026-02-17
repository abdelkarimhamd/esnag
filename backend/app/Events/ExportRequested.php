<?php

namespace App\Events;

use App\Models\ExportJob;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ExportRequested
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly ExportJob $exportJob,
    ) {
    }
}
