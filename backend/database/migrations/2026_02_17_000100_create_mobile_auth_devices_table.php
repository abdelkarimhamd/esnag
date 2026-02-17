<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_auth_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('device_id', 120);
            $table->string('device_name')->nullable();
            $table->string('platform', 40)->default('mobile');
            $table->string('app_version', 80)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('trusted_until')->nullable();
            $table->foreignId('last_token_id')->nullable()->constrained('personal_access_tokens')->nullOnDelete();
            $table->string('last_ip', 120)->nullable();
            $table->text('last_user_agent')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'device_id'], 'mobile_auth_devices_unique_user_device');
            $table->index(['user_id', 'is_active', 'trusted_until'], 'mobile_auth_devices_user_active_trusted_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_auth_devices');
    }
};

