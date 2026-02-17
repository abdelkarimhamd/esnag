<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('digests:send daily')->dailyAt('08:00');
Schedule::command('digests:send weekly')->weeklyOn(1, '08:15');
Schedule::command('digests:send monthly')->monthlyOn(1, '08:30');
Schedule::command('snags:escalate-overdue')->hourly();
Schedule::command('snags:send-reminders')->hourlyAt(10);
Schedule::command('inspections:generate-recurring')->hourlyAt(15);

