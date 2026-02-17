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
        Schema::table('snags', function (Blueprint $table): void {
            $table->foreignId('assigned_company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->foreignId('assigned_team_id')->nullable()->constrained('stakeholder_teams')->nullOnDelete();
            $table->foreignId('dispatched_to')->nullable()->constrained('users')->nullOnDelete();
            $table->text('dispatch_note')->nullable();
            $table->timestamp('dispatched_at')->nullable();

            $table->index(['assigned_company_id', 'assigned_team_id'], 'snags_company_team_index');
            $table->index(['dispatched_to', 'dispatched_at'], 'snags_dispatched_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('snags', function (Blueprint $table): void {
            $table->dropIndex('snags_company_team_index');
            $table->dropIndex('snags_dispatched_index');

            $table->dropConstrainedForeignId('assigned_company_id');
            $table->dropConstrainedForeignId('assigned_team_id');
            $table->dropConstrainedForeignId('dispatched_to');
            $table->dropColumn('dispatch_note');
            $table->dropColumn('dispatched_at');
        });
    }
};
