<?php

namespace App\Console\Commands;

use App\Services\SnagReminderService;
use Illuminate\Console\Command;

class SendSnagRemindersCommand extends Command
{
    protected $signature = 'snags:send-reminders {--organization_id= : Optional organization scope}';

    protected $description = 'Send automatic snag reminders based on active reminder policies';

    public function __construct(
        private readonly SnagReminderService $snagReminderService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $organizationId = $this->option('organization_id');
        $organizationId = is_numeric($organizationId) ? (int) $organizationId : null;

        $stats = $this->snagReminderService->sendDueReminders($organizationId);

        $this->info(sprintf(
            'Reminders done policies=%d candidates=%d sent=%d skipped=%d',
            $stats['policies'],
            $stats['candidates'],
            $stats['sent'],
            $stats['skipped'],
        ));

        return self::SUCCESS;
    }
}
