<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotency store for mobile sync operations carrying a client-supplied op_id.
     * When a request commits server-side but its HTTP response is lost, the client
     * replays the same op_id; this table lets apply() return the original result
     * instead of re-running the handler (which would surface a phantom conflict on
     * snag.update or a false rejection on snag.transition).
     */
    public function up(): void
    {
        Schema::create('mobile_sync_processed_operations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('op_id', 120);
            $table->string('status', 40);
            $table->json('result')->nullable();
            $table->timestamp('processed_at');
            $table->timestamps();

            $table->unique(['organization_id', 'op_id'], 'mobile_sync_processed_ops_org_op_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_sync_processed_operations');
    }
};
