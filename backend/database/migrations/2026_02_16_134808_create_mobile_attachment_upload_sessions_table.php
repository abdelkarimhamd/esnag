<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_attachment_upload_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->constrained()->cascadeOnDelete();
            $table->string('upload_uuid')->unique();
            $table->string('file_name');
            $table->string('mime_type');
            $table->unsignedInteger('total_chunks');
            $table->json('received_chunks')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('status')->default('initiated');
            $table->string('temp_dir');
            $table->string('assembled_path')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status', 'expires_at'], 'mobile_upload_sessions_org_status_expires');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_attachment_upload_sessions');
    }
};
