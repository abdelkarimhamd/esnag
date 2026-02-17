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
        Schema::create('drawing_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('drawing_id')->constrained()->cascadeOnDelete();
            $table->string('revision_label');
            $table->string('file_name');
            $table->string('file_path');
            $table->string('mime_type');
            $table->unsignedBigInteger('file_size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->boolean('is_current')->default(false);
            $table->timestamps();

            $table->unique(['drawing_id', 'revision_label']);
            $table->index(['organization_id', 'drawing_id', 'is_current']);
        });

        Schema::table('drawings', function (Blueprint $table) {
            $table->foreign('current_revision_id')
                ->references('id')
                ->on('drawing_revisions')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('drawings', function (Blueprint $table) {
            $table->dropForeign(['current_revision_id']);
        });

        Schema::dropIfExists('drawing_revisions');
    }
};

