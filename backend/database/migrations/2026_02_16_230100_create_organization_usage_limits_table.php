<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_usage_limits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('storage_quota_mb')->default(5120);
            $table->unsignedInteger('max_exports_per_day')->default(100);
            $table->unsignedInteger('max_users')->default(250);
            $table->json('meta')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('organization_id', 'org_usage_limits_org_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_usage_limits');
    }
};

