<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Link an inspection request to the snag it inspects, so "snag received → request an
// inspection (assigned to a responsible team) → team does the inspection" is a real
// chain rather than a standalone record.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inspection_requests', function (Blueprint $table): void {
            $table->foreignId('snag_id')->nullable()->constrained('snags')->nullOnDelete();
            $table->index(['organization_id', 'snag_id']);
        });
    }

    public function down(): void
    {
        Schema::table('inspection_requests', function (Blueprint $table): void {
            $table->dropForeign(['snag_id']);
            $table->dropIndex(['organization_id', 'snag_id']);
            $table->dropColumn('snag_id');
        });
    }
};
