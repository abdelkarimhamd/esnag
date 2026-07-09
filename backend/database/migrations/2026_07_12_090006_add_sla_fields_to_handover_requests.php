<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (OD-13 / BR-FR-038) — a per-stage SLA clock on the handover request so
 * a stage cannot stall indefinitely. stage_due_at is (re)computed each time the
 * request enters a stage; last_escalated_at throttles repeat escalations.
 * Additive: two nullable timestamps.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('handover_requests', function (Blueprint $table) {
            $table->timestamp('stage_due_at')->nullable()->after('closed_at');
            $table->timestamp('last_escalated_at')->nullable()->after('stage_due_at');
        });
    }

    public function down(): void
    {
        Schema::table('handover_requests', function (Blueprint $table) {
            $table->dropColumn(['stage_due_at', 'last_escalated_at']);
        });
    }
};
