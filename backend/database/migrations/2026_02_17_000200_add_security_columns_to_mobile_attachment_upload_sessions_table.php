<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mobile_attachment_upload_sessions', function (Blueprint $table): void {
            $table->boolean('pii_redacted')->nullable()->after('file_size');
            $table->json('security_meta')->nullable()->after('assembled_path');
        });
    }

    public function down(): void
    {
        Schema::table('mobile_attachment_upload_sessions', function (Blueprint $table): void {
            $table->dropColumn(['pii_redacted', 'security_meta']);
        });
    }
};

