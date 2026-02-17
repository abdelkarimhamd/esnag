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
        Schema::create('root_cause_categories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 60)->nullable();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'name'], 'root_cause_categories_org_name_unique');
            $table->index(['organization_id', 'is_active'], 'root_cause_categories_org_active_idx');
        });

        Schema::table('snags', function (Blueprint $table): void {
            $table->foreignId('root_cause_category_id')
                ->nullable()
                ->after('location_id')
                ->constrained('root_cause_categories')
                ->nullOnDelete();
            $table->decimal('estimated_cost', 12, 2)->nullable()->after('due_date');
            $table->decimal('estimated_hours', 10, 2)->nullable()->after('estimated_cost');
            $table->timestamp('acknowledged_at')->nullable()->after('estimated_hours');
            $table->timestamp('started_at')->nullable()->after('acknowledged_at');
            $table->timestamp('ready_for_review_at')->nullable()->after('started_at');

            $table->index(['organization_id', 'root_cause_category_id'], 'snags_org_root_cause_idx');
            $table->index(['organization_id', 'acknowledged_at'], 'snags_org_acknowledged_idx');
            $table->index(['organization_id', 'ready_for_review_at'], 'snags_org_ready_review_idx');
        });

        Schema::create('dashboard_configs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->json('cards');
            $table->json('filters')->nullable();
            $table->json('layout')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'user_id'], 'dashboard_configs_org_user_idx');
            $table->index(['organization_id', 'is_default'], 'dashboard_configs_org_default_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dashboard_configs');

        Schema::table('snags', function (Blueprint $table): void {
            $table->dropIndex('snags_org_root_cause_idx');
            $table->dropIndex('snags_org_acknowledged_idx');
            $table->dropIndex('snags_org_ready_review_idx');
            $table->dropConstrainedForeignId('root_cause_category_id');
            $table->dropColumn([
                'estimated_cost',
                'estimated_hours',
                'acknowledged_at',
                'started_at',
                'ready_for_review_at',
            ]);
        });

        Schema::dropIfExists('root_cause_categories');
    }
};

