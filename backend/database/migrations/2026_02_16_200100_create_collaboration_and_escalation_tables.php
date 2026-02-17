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
        Schema::table('snag_comments', function (Blueprint $table): void {
            $table->foreignId('parent_id')
                ->nullable()
                ->after('snag_id')
                ->constrained('snag_comments')
                ->nullOnDelete();
            $table->index(['snag_id', 'parent_id', 'created_at'], 'snag_comments_snag_parent_created_idx');
        });

        Schema::create('snag_watchers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('source')->default('manual');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['snag_id', 'user_id'], 'snag_watchers_snag_user_unique');
            $table->index(['organization_id', 'user_id'], 'snag_watchers_org_user_idx');
            $table->index(['organization_id', 'snag_id'], 'snag_watchers_org_snag_idx');
        });

        Schema::create('snag_comment_mentions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_comment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('mentioned_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('mentioned_team_id')->nullable()->constrained('stakeholder_teams')->cascadeOnDelete();
            $table->string('token')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'mentioned_user_id'], 'snag_comment_mentions_org_user_idx');
            $table->index(['organization_id', 'mentioned_team_id'], 'snag_comment_mentions_org_team_idx');
            $table->index(['snag_comment_id', 'mentioned_user_id'], 'snag_comment_mentions_comment_user_idx');
        });

        Schema::create('snag_comment_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_comment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('file');
            $table->string('file_name');
            $table->string('file_path');
            $table->string('mime_type');
            $table->unsignedBigInteger('file_size');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'snag_comment_id'], 'snag_comment_attachments_org_comment_idx');
        });

        Schema::create('inspection_approval_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_submission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inspection_approval_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('message_type')->default('comment');
            $table->text('body');
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'inspection_submission_id'], 'inspection_approval_messages_org_submission_idx');
            $table->index(['inspection_submission_id', 'created_at'], 'inspection_approval_messages_submission_created_idx');
        });

        Schema::create('snag_escalation_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('overdue_days')->default(3);
            $table->json('escalate_to_roles');
            $table->unsignedSmallInteger('cooldown_hours')->default(24);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_evaluated_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'project_id', 'is_active'], 'snag_escalation_rules_org_project_active_idx');
        });

        Schema::create('snag_escalations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_id')->constrained()->cascadeOnDelete();
            $table->foreignId('snag_escalation_rule_id')->constrained()->cascadeOnDelete();
            $table->foreignId('escalated_to_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('escalated_at');
            $table->string('status_at_escalation', 50)->nullable();
            $table->string('reason', 400)->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'snag_id', 'escalated_at'], 'snag_escalations_org_snag_time_idx');
            $table->index(['snag_id', 'snag_escalation_rule_id', 'escalated_to_user_id', 'escalated_at'], 'snag_escalations_uniqueness_lookup_idx');
        });

        Schema::table('notification_preferences', function (Blueprint $table): void {
            $table->boolean('immediate_mention')->default(true)->after('immediate_comment');
            $table->boolean('immediate_escalation')->default(true)->after('immediate_mention');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('notification_preferences', function (Blueprint $table): void {
            $table->dropColumn(['immediate_mention', 'immediate_escalation']);
        });

        Schema::dropIfExists('snag_escalations');
        Schema::dropIfExists('snag_escalation_rules');
        Schema::dropIfExists('inspection_approval_messages');
        Schema::dropIfExists('snag_comment_attachments');
        Schema::dropIfExists('snag_comment_mentions');
        Schema::dropIfExists('snag_watchers');

        Schema::table('snag_comments', function (Blueprint $table): void {
            $table->dropIndex('snag_comments_snag_parent_created_idx');
            $table->dropConstrainedForeignId('parent_id');
        });
    }
};
