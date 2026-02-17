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
        Schema::create('inspection_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_submission_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('step_order');
            $table->string('step_name')->nullable();
            $table->string('role_name');
            $table->boolean('requires_signature')->default(false);
            $table->string('status')->default('pending');
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('decision_notes')->nullable();
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();

            $table->unique(['inspection_submission_id', 'step_order'], 'inspection_approvals_submission_step');
            $table->index(['organization_id', 'status'], 'inspection_approvals_org_status');
            $table->index(['organization_id', 'role_name', 'status'], 'inspection_approvals_org_role_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inspection_approvals');
    }
};
