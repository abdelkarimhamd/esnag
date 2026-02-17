<?php

namespace App\Console\Commands;

use App\Services\DigestDispatchService;
use Illuminate\Console\Command;

class SendDigestCommand extends Command
{
    protected $signature = 'digests:send {frequency=daily : daily|weekly|monthly}';

    protected $description = 'Send scheduled digest summaries based on user notification preferences';

    public function __construct(
        private readonly DigestDispatchService $digestDispatchService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $frequency = strtolower((string) $this->argument('frequency'));
        if (! in_array($frequency, ['daily', 'weekly', 'monthly'], true)) {
            $this->error('Invalid frequency. Expected one of: daily, weekly, monthly.');

            return self::FAILURE;
        }

        $stats = $this->digestDispatchService->dispatch($frequency);

        $this->info(sprintf(
            'Digests processed=%d sent=%d skipped=%d',
            $stats['processed'],
            $stats['sent'],
            $stats['skipped'],
        ));

        return self::SUCCESS;
    }
}
