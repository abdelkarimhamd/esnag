<?php

namespace App\Services;

use App\Events\InspectionRealtimeMessage;
use App\Models\InspectionRecurringRun;
use App\Models\InspectionRecurringSchedule;
use App\Models\InspectionSubmission;
use App\Models\User;
use Illuminate\Support\Carbon;

class InspectionRecurringScheduleService
{
    /**
     * @return array{scheduled:int,generated:int,skipped:int,failed:int}
     */
    public function generateDueSubmissions(?int $organizationId = null): array
    {
        $stats = [
            'scheduled' => 0,
            'generated' => 0,
            'skipped' => 0,
            'failed' => 0,
        ];

        $schedules = InspectionRecurringSchedule::query()
            ->where('is_active', true)
            ->where('next_run_at', '<=', now())
            ->where('starts_at', '<=', now())
            ->where(function ($query): void {
                $query->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', now());
            })
            ->when($organizationId !== null, fn ($query) => $query->where('organization_id', $organizationId))
            ->with(['template', 'assignee'])
            ->orderBy('organization_id')
            ->orderBy('project_id')
            ->orderBy('id')
            ->get();

        foreach ($schedules as $schedule) {
            $stats['scheduled']++;

            try {
                $template = $schedule->template;
                if (! $template || ! $template->is_active) {
                    $this->recordRun($schedule, null, 'skipped', 'Template missing or inactive.');
                    $schedule->next_run_at = $this->calculateFutureRunAt($schedule, $schedule->next_run_at ?: now());
                    $schedule->save();
                    $stats['skipped']++;
                    continue;
                }

                $actorId = $this->resolveActorUserId($schedule);
                if (! $actorId) {
                    $this->recordRun($schedule, null, 'failed', 'No active user available for recurring submission ownership.');
                    $schedule->next_run_at = $this->calculateFutureRunAt($schedule, $schedule->next_run_at ?: now());
                    $schedule->save();
                    $stats['failed']++;
                    continue;
                }

                $submission = InspectionSubmission::query()->create([
                    'organization_id' => $schedule->organization_id,
                    'project_id' => $schedule->project_id ?: $template->project_id,
                    'inspection_template_id' => $template->id,
                    'reference' => $this->nextReference($schedule->organization_id),
                    'status' => InspectionSubmission::STATUS_DRAFT,
                    'form_data' => $schedule->default_form_data ?: [],
                    'current_approval_order' => null,
                    'created_by' => $actorId,
                    'submitted_by' => null,
                    'submitted_at' => null,
                    'approved_at' => null,
                    'rejected_at' => null,
                    'last_updated_by' => $actorId,
                ]);

                $this->recordRun($schedule, $submission, 'generated', 'Recurring submission generated.');

                $schedule->next_run_at = $this->calculateFutureRunAt($schedule, $schedule->next_run_at ?: now());
                $schedule->save();

                event(new InspectionRealtimeMessage($schedule->organization_id, [
                    'action' => 'recurring_submission_generated',
                    'inspection_submission_id' => $submission->id,
                    'reference' => $submission->reference,
                    'status' => $submission->status,
                    'project_id' => $submission->project_id,
                    'recurring_schedule_id' => $schedule->id,
                ]));

                $stats['generated']++;
            } catch (\Throwable $exception) {
                $this->recordRun($schedule, null, 'failed', $exception->getMessage());
                $schedule->next_run_at = $this->calculateFutureRunAt($schedule, $schedule->next_run_at ?: now());
                $schedule->save();
                $stats['failed']++;
            }
        }

        return $stats;
    }

    public function calculateInitialNextRunAt(
        string $recurrence,
        int $intervalValue,
        Carbon $startsAt,
        string $runTime,
        string $timezone,
    ): Carbon {
        $synthetic = new InspectionRecurringSchedule([
            'recurrence' => $recurrence,
            'interval_value' => max(1, $intervalValue),
            'run_time' => $runTime,
            'timezone' => $timezone,
        ]);

        $runAt = $startsAt->copy();
        $runAt = $this->alignToScheduleTime($synthetic, $runAt);

        while ($runAt->lte(now())) {
            $runAt = $this->nextRunAt($synthetic, $runAt);
        }

        return $runAt;
    }

    public function calculateFutureRunAt(InspectionRecurringSchedule $schedule, Carbon $from): Carbon
    {
        $next = $from->copy();
        $guard = 0;

        do {
            $next = $this->nextRunAt($schedule, $next);
            $guard++;
        } while ($next->lte(now()) && $guard < 24);

        return $next;
    }

    private function nextRunAt(InspectionRecurringSchedule $schedule, Carbon $from): Carbon
    {
        $timezone = $schedule->timezone ?: 'UTC';
        $intervalValue = max(1, (int) $schedule->interval_value);

        $local = $from->copy()->setTimezone($timezone);

        $local = match ($schedule->recurrence) {
            InspectionRecurringSchedule::RECURRENCE_DAILY => $local->addDays($intervalValue),
            InspectionRecurringSchedule::RECURRENCE_BIWEEKLY => $local->addWeeks($intervalValue * 2),
            InspectionRecurringSchedule::RECURRENCE_MONTHLY => $local->addMonthsNoOverflow($intervalValue),
            default => $local->addWeeks($intervalValue),
        };

        $local = $this->alignToScheduleTime($schedule, $local);

        return $local->setTimezone('UTC');
    }

    private function alignToScheduleTime(InspectionRecurringSchedule $schedule, Carbon $dateTime): Carbon
    {
        $timezone = $schedule->timezone ?: 'UTC';
        $runTime = trim((string) ($schedule->run_time ?: '08:00'));
        if (! preg_match('/^\d{2}:\d{2}$/', $runTime)) {
            $runTime = '08:00';
        }

        return $dateTime
            ->copy()
            ->setTimezone($timezone)
            ->setTimeFromTimeString($runTime)
            ->setTimezone('UTC');
    }

    private function resolveActorUserId(InspectionRecurringSchedule $schedule): ?int
    {
        $candidates = array_filter([
            $schedule->assign_to_user_id,
            $schedule->created_by,
            $schedule->updated_by,
            $schedule->template?->created_by,
        ]);

        foreach ($candidates as $candidateId) {
            $user = User::query()->find($candidateId);
            if (! $user) {
                continue;
            }

            if ($user->organizations()->where('organizations.id', $schedule->organization_id)->exists()) {
                return $user->id;
            }
        }

        return User::query()
            ->whereHas('organizations', function ($query) use ($schedule): void {
                $query->where('organizations.id', $schedule->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->value('id');
    }

    private function nextReference(int $organizationId): string
    {
        $next = InspectionSubmission::query()
            ->where('organization_id', $organizationId)
            ->count() + 1;

        do {
            $reference = 'INSP-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
            $exists = InspectionSubmission::query()
                ->where('organization_id', $organizationId)
                ->where('reference', $reference)
                ->exists();
            $next++;
        } while ($exists);

        return $reference;
    }

    private function recordRun(
        InspectionRecurringSchedule $schedule,
        ?InspectionSubmission $submission,
        string $status,
        string $message,
    ): void {
        InspectionRecurringRun::query()->create([
            'organization_id' => $schedule->organization_id,
            'inspection_recurring_schedule_id' => $schedule->id,
            'inspection_submission_id' => $submission?->id,
            'run_at' => now(),
            'status' => $status,
            'message' => $message,
            'payload' => [
                'project_id' => $schedule->project_id,
                'inspection_template_id' => $schedule->inspection_template_id,
            ],
        ]);
    }
}
