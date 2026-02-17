<?php

namespace App\Console\Commands;

use App\Services\SnagEscalationService;
use Illuminate\Console\Command;

class EscalateOverdueSnagsCommand extends Command
{
    protected $signature = 'snags:escalate-overdue {--organization_id= : Optional organization scope}';

    protected $description = 'Escalate overdue snags based on active escalation rules';

    public function __construct(
        private readonly SnagEscalationService $snagEscalationService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $organizationId = $this->option('organization_id');
        $organizationId = is_numeric($organizationId) ? (int) $organizationId : null;

        $stats = $this->snagEscalationService->evaluate($organizationId);

        $this->info(sprintf(
            'Escalation done rules=%d snags=%d escalations=%d skipped=%d',
            $stats['rules'],
            $stats['snags'],
            $stats['escalations'],
            $stats['skipped'],
        ));

        return self::SUCCESS;
    }
}

