<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('digest_frequency')->default('daily');
            $table->boolean('email_enabled')->default(true);
            $table->boolean('in_app_enabled')->default(true);
            $table->boolean('push_enabled')->default(false);
            $table->boolean('immediate_assignment')->default(true);
            $table->boolean('immediate_status_change')->default(true);
            $table->boolean('immediate_comment')->default(true);
            $table->boolean('approval_needed')->default(true);
            $table->boolean('signature_requested')->default(true);
            $table->string('quiet_hours_start')->nullable();
            $table->string('quiet_hours_end')->nullable();
            $table->string('timezone')->default('UTC');
            $table->timestamp('last_daily_sent_at')->nullable();
            $table->timestamp('last_weekly_sent_at')->nullable();
            $table->timestamp('last_monthly_sent_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'user_id'], 'notification_preferences_org_user_unique');
            $table->index(['organization_id', 'digest_frequency'], 'notification_preferences_org_digest');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_preferences');
    }
};
