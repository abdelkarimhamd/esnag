<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ops_health_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event_type', 120);
            $table->string('severity', 30)->default('error');
            $table->string('source', 120);
            $table->text('message')->nullable();
            $table->json('context')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['organization_id', 'event_type', 'occurred_at'], 'ops_health_events_org_type_occurred_idx');
            $table->index(['source', 'occurred_at'], 'ops_health_events_source_occurred_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ops_health_events');
    }
};

