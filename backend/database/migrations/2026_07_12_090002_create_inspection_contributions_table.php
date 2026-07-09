<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 8 / BR-BR-002, BR-BR-017) — per-observation contributor
 * attribution for inspection submissions. Multiple parties (SP inspectors, FMMP
 * consolidators) can contribute to one submission; each field/photo they author
 * is recorded with the user, their party, and a timestamp. Additive: new table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspection_contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_submission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stakeholder_company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->string('field_key')->nullable();
            $table->string('contribution_type', 30)->default('observation');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['inspection_submission_id', 'field_key'], 'inspection_contributions_field_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspection_contributions');
    }
};
