<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 10 / BR-FR-031, BR-BR-002) — a first-class handover discussion
 * thread scoped to (request, stage, cycle, source party). Distinct from the
 * immutable handover_events audit trail: comments are a mutable, attributable
 * conversation with a cross-party visibility flag. Mirrors snag_comments.
 * Additive: new table only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('handover_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('handover_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('source_company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('handover_comments')->cascadeOnDelete();
            $table->unsignedSmallInteger('stage_order')->nullable();
            $table->unsignedInteger('cycle_number')->default(1);
            $table->uuid('client_uuid')->nullable();
            $table->text('body');
            // Cross-party visibility (BR-FR-031): internal comments are visible only
            // to the author's own party; the default is visible to every party.
            $table->boolean('is_internal')->default(false);
            $table->timestamps();

            $table->index(['organization_id', 'handover_request_id'], 'handover_comments_stream_idx');
            $table->index(['handover_request_id', 'stage_order', 'cycle_number'], 'handover_comments_stage_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('handover_comments');
    }
};
