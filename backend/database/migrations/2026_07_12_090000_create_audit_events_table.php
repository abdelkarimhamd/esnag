<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 (item 9 / BR-BR-013) — the unified, polymorphic, append-only audit
 * stream for every governed change across the platform: snag reassignments and
 * status changes, master-data mutations, workflow config, and RBAC/membership
 * changes. Write-once like handover_events (created_at only, no updated_at; the
 * model rejects updates/deletes). Additive: new table only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            // Polymorphic subject — nullable because admin actions (e.g. an RBAC or
            // membership change) may not map to a single owning record. Creates the
            // (subject_type, subject_id) index automatically.
            $table->nullableMorphs('subject');
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('actor_company_id')->nullable()->constrained('stakeholder_companies')->nullOnDelete();
            $table->string('actor_role')->nullable();
            $table->string('action', 80);
            $table->json('prior')->nullable();
            $table->json('new')->nullable();
            $table->text('reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['organization_id', 'created_at'], 'audit_events_org_time_idx');
            $table->index(['organization_id', 'action'], 'audit_events_org_action_idx');
            $table->index('actor_id', 'audit_events_actor_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
