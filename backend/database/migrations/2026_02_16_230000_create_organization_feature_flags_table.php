<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_feature_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('feature_key', 120);
            $table->boolean('is_enabled')->default(true);
            $table->json('meta')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'project_id', 'feature_key'], 'org_feature_flags_unique_scope');
            $table->index(['organization_id', 'feature_key'], 'org_feature_flags_org_feature_idx');
            $table->index(['organization_id', 'project_id'], 'org_feature_flags_org_project_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_feature_flags');
    }
};

