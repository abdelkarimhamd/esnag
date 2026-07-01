<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ProjectController::index() sorts the project list by recent activity using
     * correlated MAX(updated_at) subqueries over snags and drawings per project.
     * These (project_id, updated_at) indexes let the database answer each per-project
     * MAX from the tail of the index instead of scanning matching rows.
     */
    public function up(): void
    {
        Schema::table('snags', function (Blueprint $table): void {
            $table->index(['project_id', 'updated_at'], 'snags_project_updated_at');
        });

        Schema::table('drawings', function (Blueprint $table): void {
            $table->index(['project_id', 'updated_at'], 'drawings_project_updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('drawings', function (Blueprint $table): void {
            $table->dropIndex('drawings_project_updated_at');
        });

        Schema::table('snags', function (Blueprint $table): void {
            $table->dropIndex('snags_project_updated_at');
        });
    }
};
