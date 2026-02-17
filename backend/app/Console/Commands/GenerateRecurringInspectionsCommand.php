<?php

namespace App\Console\Commands;

use App\Services\InspectionRecurringScheduleService;
use Illuminate\Console\Command;

class GenerateRecurringInspectionsCommand extends Command
{
    protected $signature = 'inspections:generate-recurring {--organization_id= : Optional organization scope}';

    protected $description = 'Generate recurring inspection submissions for due schedules';

    public function __construct(
        private readonly InspectionRecurringScheduleService $inspectionRecurringScheduleService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $organizationId = $this->option('organization_id');
        $organizationId = is_numeric($organizationId) ? (int) $organizationId : null;

        $stats = $this->inspectionRecurringScheduleService->generateDueSubmissions($organizationId);

        $this->info(sprintf(
            'Recurring generation done scheduled=%d generated=%d skipped=%d failed=%d',
            $stats['scheduled'],
            $stats['generated'],
            $stats['skipped'],
            $stats['failed'],
        ));

        return self::SUCCESS;
    }
}
