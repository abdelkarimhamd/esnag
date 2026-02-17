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
        Schema::create('inspection_signatures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_submission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('signed_by')->constrained('users')->cascadeOnDelete();
            $table->string('context')->default('approval_step');
            $table->string('file_name');
            $table->string('file_path');
            $table->string('mime_type')->default('image/png');
            $table->unsignedBigInteger('file_size');
            $table->timestamp('signed_at');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'signed_by'], 'inspection_signatures_org_signed_by');
            $table->index(['inspection_submission_id', 'inspection_approval_id'], 'inspection_signatures_submission_approval');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inspection_signatures');
    }
};
