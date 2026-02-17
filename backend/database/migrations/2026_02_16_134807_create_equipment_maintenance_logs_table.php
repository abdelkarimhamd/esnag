<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment_maintenance_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('equipment_id')->constrained('equipments')->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('snag_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('ok');
            $table->text('description')->nullable();
            $table->text('action_taken')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('next_due_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'equipment_id', 'status'], 'equip_logs_org_equipment_status');
            $table->index(['organization_id', 'project_id', 'occurred_at'], 'equip_logs_org_project_occurred');
            $table->index(['snag_id', 'occurred_at'], 'equip_logs_snag_occurred');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_maintenance_logs');
    }
};
