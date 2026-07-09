<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 11 / §11.2) — per-user opt-in for the SMS notification channel.
 * Off by default; email remains the guaranteed fallback (OD-14). Additive.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table) {
            $table->boolean('sms_enabled')->default(false)->after('push_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table) {
            $table->dropColumn('sms_enabled');
        });
    }
};
