<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 8 / BR-FR-037, OD-08) — admin-definable optional observation
 * fields for FMMP consolidation and Service-Provider inspections, stored
 * alongside the fixed checklist schema. Additive: one nullable JSON column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inspection_templates', function (Blueprint $table) {
            $table->json('observation_fields')->nullable()->after('schema');
        });
    }

    public function down(): void
    {
        Schema::table('inspection_templates', function (Blueprint $table) {
            $table->dropColumn('observation_fields');
        });
    }
};
