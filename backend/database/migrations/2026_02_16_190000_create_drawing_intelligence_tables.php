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
        Schema::create('drawing_revision_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('drawing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('from_revision_id')->constrained('drawing_revisions')->cascadeOnDelete();
            $table->foreignId('to_revision_id')->constrained('drawing_revisions')->cascadeOnDelete();
            $table->string('transform_type', 40)->default('identity');
            $table->json('transform_params')->nullable();
            $table->decimal('confidence_score', 5, 2)->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['drawing_id', 'from_revision_id', 'to_revision_id'], 'drm_unique_pair');
            $table->index(['organization_id', 'drawing_id'], 'drm_org_drawing_idx');
            $table->index(['organization_id', 'from_revision_id', 'to_revision_id'], 'drm_org_revisions_idx');
        });

        Schema::create('drawing_location_zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('drawing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('drawing_revision_id')->nullable()->constrained('drawing_revisions')->nullOnDelete();
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->string('zone_label')->nullable();
            $table->decimal('x_min', 8, 6);
            $table->decimal('y_min', 8, 6);
            $table->decimal('x_max', 8, 6);
            $table->decimal('y_max', 8, 6);
            $table->unsignedSmallInteger('priority')->default(100);
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'drawing_id', 'drawing_revision_id'], 'dlz_org_drawing_revision_idx');
            $table->index(['organization_id', 'location_id'], 'dlz_org_location_idx');
            $table->index(['drawing_id', 'x_min', 'x_max', 'y_min', 'y_max'], 'dlz_drawing_bbox_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('drawing_location_zones');
        Schema::dropIfExists('drawing_revision_mappings');
    }
};
