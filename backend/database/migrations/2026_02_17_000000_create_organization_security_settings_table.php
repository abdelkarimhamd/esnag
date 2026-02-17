<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_security_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->boolean('mfa_required_web')->default(false);
            $table->boolean('mfa_required_mobile')->default(false);
            $table->unsignedSmallInteger('mobile_device_trust_days')->default(30);
            $table->boolean('enforce_ip_allowlist')->default(false);
            $table->json('ip_allowlist')->nullable();
            $table->string('antivirus_mode', 20)->default('off');
            $table->string('pii_redaction_mode', 20)->default('off');
            $table->json('meta')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('organization_id', 'org_security_settings_unique_org');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_security_settings');
    }
};

