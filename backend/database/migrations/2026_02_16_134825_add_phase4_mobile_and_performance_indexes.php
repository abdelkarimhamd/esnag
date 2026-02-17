<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('snags', function (Blueprint $table): void {
            $table->foreignId('equipment_id')->nullable()->after('location_id')->constrained('equipments')->nullOnDelete();
            $table->uuid('client_uuid')->nullable()->after('reference');
            $table->index(['organization_id', 'client_uuid'], 'snags_org_client_uuid');
            $table->index(['organization_id', 'updated_at'], 'snags_org_updated_at');
            $table->index(['organization_id', 'status', 'assigned_to', 'due_date'], 'snags_org_status_assignee_due');
        });

        Schema::table('snag_comments', function (Blueprint $table): void {
            $table->uuid('client_uuid')->nullable()->after('snag_id');
            $table->index(['organization_id', 'created_at'], 'snag_comments_org_created_at');
            $table->index(['snag_id', 'client_uuid'], 'snag_comments_snag_client_uuid');
        });

        Schema::table('snag_attachments', function (Blueprint $table): void {
            $table->uuid('client_uuid')->nullable()->after('snag_id');
            $table->index(['organization_id', 'created_at'], 'snag_attachments_org_created_at');
            $table->index(['snag_id', 'client_uuid'], 'snag_attachments_snag_client_uuid');
        });

        Schema::table('inspection_submissions', function (Blueprint $table): void {
            $table->index(['organization_id', 'updated_at'], 'inspection_submissions_org_updated');
        });

        Schema::table('inspection_requests', function (Blueprint $table): void {
            $table->index(['organization_id', 'scheduled_for'], 'inspection_requests_org_scheduled');
        });

        Schema::table('export_jobs', function (Blueprint $table): void {
            $table->index(['organization_id', 'status', 'created_at'], 'export_jobs_org_status_created');
        });
    }

    public function down(): void
    {
        Schema::table('export_jobs', function (Blueprint $table): void {
            $table->dropIndex('export_jobs_org_status_created');
        });

        Schema::table('inspection_requests', function (Blueprint $table): void {
            $table->dropIndex('inspection_requests_org_scheduled');
        });

        Schema::table('inspection_submissions', function (Blueprint $table): void {
            $table->dropIndex('inspection_submissions_org_updated');
        });

        Schema::table('snag_attachments', function (Blueprint $table): void {
            $table->dropIndex('snag_attachments_org_created_at');
            $table->dropIndex('snag_attachments_snag_client_uuid');
            $table->dropColumn('client_uuid');
        });

        Schema::table('snag_comments', function (Blueprint $table): void {
            $table->dropIndex('snag_comments_org_created_at');
            $table->dropIndex('snag_comments_snag_client_uuid');
            $table->dropColumn('client_uuid');
        });

        Schema::table('snags', function (Blueprint $table): void {
            $table->dropIndex('snags_org_client_uuid');
            $table->dropIndex('snags_org_updated_at');
            $table->dropIndex('snags_org_status_assignee_due');
            $table->dropConstrainedForeignId('equipment_id');
            $table->dropColumn('client_uuid');
        });
    }
};
