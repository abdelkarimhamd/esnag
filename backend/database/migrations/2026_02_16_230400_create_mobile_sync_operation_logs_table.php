<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_sync_operation_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('op_id', 120)->nullable();
            $table->string('operation_type', 120);
            $table->string('status', 40);
            $table->string('source', 40)->default('apply');
            $table->string('error_code', 120)->nullable();
            $table->text('error_message')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['organization_id', 'occurred_at'], 'mobile_sync_logs_org_occurred_idx');
            $table->index(['organization_id', 'status', 'occurred_at'], 'mobile_sync_logs_org_status_occurred_idx');
            $table->index(['organization_id', 'operation_type'], 'mobile_sync_logs_org_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_sync_operation_logs');
    }
};

