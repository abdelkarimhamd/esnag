<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 12 / BR-FR-026/028) — links a Drawing to its Area, mirroring the
 * buildings.area_id link. Nullable so existing drawings are unaffected; usually
 * derived from the drawing's building. Additive.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drawings', function (Blueprint $table) {
            $table->foreignId('area_id')->nullable()->after('project_id')
                ->constrained('areas')->nullOnDelete();
            $table->index(['organization_id', 'area_id'], 'drawings_org_area_idx');
        });
    }

    public function down(): void
    {
        Schema::table('drawings', function (Blueprint $table) {
            $table->dropIndex('drawings_org_area_idx');
            $table->dropConstrainedForeignId('area_id');
        });
    }
};
