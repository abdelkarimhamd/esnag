<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->boolean('is_training')->default(false)->after('status');
            $table->boolean('training_locked')->default(false)->after('is_training');
            $table->text('training_notes')->nullable()->after('training_locked');

            $table->index(['organization_id', 'is_training'], 'projects_org_training');
        });

        Schema::table('closeout_templates', function (Blueprint $table): void {
            $table->string('discipline', 120)->nullable()->after('trade');
            $table->boolean('is_library')->default(false)->after('is_active');
            $table->string('library_key', 140)->nullable()->after('is_library');

            $table->index(['organization_id', 'is_library', 'discipline'], 'closeout_templates_org_library_discipline');
        });

        Schema::table('inspection_templates', function (Blueprint $table): void {
            $table->string('discipline', 120)->nullable()->after('type');
            $table->boolean('is_library')->default(false)->after('is_active');
            $table->string('library_key', 140)->nullable()->after('is_library');

            $table->index(['organization_id', 'is_library', 'discipline'], 'inspection_templates_org_library_discipline');
        });
    }

    public function down(): void
    {
        Schema::table('inspection_templates', function (Blueprint $table): void {
            $table->dropIndex('inspection_templates_org_library_discipline');
            $table->dropColumn(['discipline', 'is_library', 'library_key']);
        });

        Schema::table('closeout_templates', function (Blueprint $table): void {
            $table->dropIndex('closeout_templates_org_library_discipline');
            $table->dropColumn(['discipline', 'is_library', 'library_key']);
        });

        Schema::table('projects', function (Blueprint $table): void {
            $table->dropIndex('projects_org_training');
            $table->dropColumn(['is_training', 'training_locked', 'training_notes']);
        });
    }
};
