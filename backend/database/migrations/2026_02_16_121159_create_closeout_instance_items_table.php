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
        Schema::create('closeout_instance_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('closeout_instance_id')->constrained()->cascadeOnDelete();
            $table->foreignId('closeout_template_item_id')->nullable()->constrained('closeout_template_items')->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->boolean('required')->default(true);
            $table->boolean('evidence_required')->default(true);
            $table->boolean('is_completed')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['closeout_instance_id', 'is_completed'], 'closeout_instance_items_completed');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('closeout_instance_items');
    }
};
