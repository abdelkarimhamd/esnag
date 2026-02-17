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
        Schema::create('stakeholder_companies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->string('type')->default('contractor');
            $table->boolean('is_active')->default(true);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'name']);
            $table->index(['organization_id', 'type']);
        });

        Schema::create('stakeholder_teams', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->string('name');
            $table->string('code')->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'project_id', 'name'], 'stakeholder_teams_org_project_name_unique');
            $table->index(['organization_id', 'company_id', 'is_active'], 'stakeholder_teams_org_company_active_index');
        });

        Schema::create('company_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->constrained('stakeholder_companies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('job_title')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['company_id', 'user_id']);
            $table->index(['organization_id', 'user_id', 'is_active'], 'company_user_org_user_active_index');
        });

        Schema::create('team_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->constrained('stakeholder_teams')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_lead')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['team_id', 'user_id']);
            $table->index(['organization_id', 'user_id', 'is_active'], 'team_user_org_user_active_index');
        });

        Schema::create('project_user_roles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role_name');
            $table->string('source')->default('manual');
            $table->timestamps();

            $table->unique(['project_id', 'user_id', 'role_name']);
            $table->index(['organization_id', 'project_id', 'user_id'], 'project_user_roles_org_project_user_index');
        });

        Schema::create('delegation_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('delegator_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('delegate_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('scope')->default('all');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->boolean('is_active')->default(true);
            $table->text('reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'delegate_user_id', 'is_active'], 'delegation_rules_org_delegate_active_index');
            $table->index(['organization_id', 'project_id', 'is_active'], 'delegation_rules_org_project_active_index');
        });

        Schema::create('permission_presets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('preset_key');
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamps();

            $table->index(['organization_id', 'preset_key']);
        });

        Schema::create('permission_preset_permissions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('permission_preset_id')->constrained('permission_presets')->cascadeOnDelete();
            $table->string('permission_name');
            $table->timestamps();

            $table->unique(['permission_preset_id', 'permission_name'], 'permission_preset_permission_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('permission_preset_permissions');
        Schema::dropIfExists('permission_presets');
        Schema::dropIfExists('delegation_rules');
        Schema::dropIfExists('project_user_roles');
        Schema::dropIfExists('team_user');
        Schema::dropIfExists('company_user');
        Schema::dropIfExists('stakeholder_teams');
        Schema::dropIfExists('stakeholder_companies');
    }
};
