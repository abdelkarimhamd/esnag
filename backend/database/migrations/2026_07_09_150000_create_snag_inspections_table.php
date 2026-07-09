<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Snag inspection (BR-FR-019/023 field extension): an on-site inspection recorded
// after a snag is received and a team is asked to inspect the asset. Lightweight and
// snag-scoped — it does not disturb the template-driven handover inspection system.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('snag_inspections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->constrained()->cascadeOnDelete();
            // The "request from the team to inspect it", when this inspection answers one.
            $table->foreignId('inspection_request_id')->nullable()->constrained('inspection_requests')->nullOnDelete();
            $table->string('reference')->nullable();
            // Asset/inspection condition status (configurable set on the client).
            $table->string('status')->default('pending');
            // Asset: an Equipment record when picked/created from the module, plus the
            // entered name (kept even for free-text so the record is self-describing).
            $table->foreignId('equipment_id')->nullable()->constrained('equipments')->nullOnDelete();
            $table->string('asset_name')->nullable();
            // Who is responsible for maintaining the asset — company / team / person.
            $table->foreignId('maintenance_company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->foreignId('maintenance_team_id')->nullable()->constrained('stakeholder_teams')->nullOnDelete();
            $table->foreignId('maintenance_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('inspected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('inspected_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['organization_id', 'snag_id']);
        });

        Schema::create('snag_inspection_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_inspection_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('photo'); // photo | document
            $table->string('file_name');
            $table->string('file_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('snag_inspection_attachments');
        Schema::dropIfExists('snag_inspections');
    }
};
