<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('snags', function (Blueprint $table): void {
            $table->string('trade', 120)->nullable()->after('priority');
            $table->index(['organization_id', 'project_id', 'trade'], 'snags_org_project_trade_idx');
        });

        Schema::create('workflow_automation_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 180);
            $table->text('description')->nullable();
            $table->string('trigger_event', 60);
            $table->json('conditions')->nullable();
            $table->json('actions');
            $table->unsignedSmallInteger('priority')->default(100);
            $table->boolean('run_once_per_snag')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_triggered_at')->nullable();
            $table->unsignedInteger('trigger_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['organization_id', 'project_id', 'trigger_event', 'is_active'],
                'workflow_rules_org_project_trigger_active_idx'
            );
            $table->index(['organization_id', 'priority'], 'workflow_rules_org_priority_idx');
        });

        Schema::create('workflow_automation_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('workflow_automation_rule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('trigger_event', 60);
            $table->string('result', 30)->default('applied');
            $table->string('message', 500)->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('executed_at');
            $table->timestamps();

            $table->index(
                ['workflow_automation_rule_id', 'snag_id', 'result'],
                'workflow_logs_rule_snag_result_idx'
            );
            $table->index(['organization_id', 'executed_at'], 'workflow_logs_org_executed_idx');
        });

        Schema::create('snag_reminder_policies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 180);
            $table->json('statuses')->nullable();
            $table->unsignedSmallInteger('reminder_every_hours')->default(24);
            $table->unsignedSmallInteger('max_reminders')->default(10);
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'project_id', 'is_active'], 'snag_reminder_policies_org_project_active_idx');
        });

        Schema::create('snag_reminder_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_reminder_policy_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('reminder_count')->default(1);
            $table->timestamp('reminded_at');
            $table->timestamp('next_due_at')->nullable();
            $table->timestamps();

            $table->index(
                ['snag_id', 'snag_reminder_policy_id', 'user_id', 'reminded_at'],
                'snag_reminder_logs_lookup_idx'
            );
            $table->index(['organization_id', 'reminded_at'], 'snag_reminder_logs_org_time_idx');
        });

        Schema::create('inspection_recurring_schedules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('inspection_template_id')->constrained()->cascadeOnDelete();
            $table->string('name', 180);
            $table->string('recurrence', 40)->default('weekly');
            $table->unsignedSmallInteger('interval_value')->default(1);
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('next_run_at');
            $table->string('run_time', 5)->default('08:00');
            $table->string('timezone', 80)->default('UTC');
            $table->json('default_form_data')->nullable();
            $table->foreignId('assign_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['organization_id', 'project_id', 'is_active', 'next_run_at'],
                'inspection_recurring_schedules_org_project_active_next_idx'
            );
        });

        Schema::create('inspection_recurring_runs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_recurring_schedule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_submission_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('run_at');
            $table->string('status', 30)->default('generated');
            $table->string('message', 500)->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['inspection_recurring_schedule_id', 'run_at'], 'inspection_recurring_runs_schedule_time_idx');
            $table->index(['organization_id', 'run_at'], 'inspection_recurring_runs_org_time_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inspection_recurring_runs');
        Schema::dropIfExists('inspection_recurring_schedules');
        Schema::dropIfExists('snag_reminder_logs');
        Schema::dropIfExists('snag_reminder_policies');
        Schema::dropIfExists('workflow_automation_logs');
        Schema::dropIfExists('workflow_automation_rules');

        Schema::table('snags', function (Blueprint $table): void {
            $table->dropIndex('snags_org_project_trade_idx');
            $table->dropColumn('trade');
        });
    }
};
