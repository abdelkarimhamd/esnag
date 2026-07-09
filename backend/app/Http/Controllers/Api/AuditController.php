<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Read-only, filterable cross-entity audit trail (item 9 / BR-FR-009/010, §11.3,
 * BR-BR-013). Gated on audit.view (owner + read-only Auditor); scoped to the
 * active organization. The stream is append-only — there is deliberately no
 * write/update/delete endpoint here.
 */
class AuditController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('audit.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'actor_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:80'],
            'action_prefix' => ['nullable', 'string', 'max:80'],
            'subject_type' => ['nullable', 'string', 'max:255'],
            'subject_id' => ['nullable', 'integer'],
            'project_id' => ['nullable', 'integer'],
            'actor_role' => ['nullable', 'string', 'max:80'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer'],
        ]);

        $query = $this->applyFilters(
            AuditEvent::query()
                ->where('organization_id', $organization->id)
                ->with(['actor:id,name,email', 'actorCompany:id,name,code,type']),
            $validated
        )->orderByDesc('created_at');

        return response()->json(
            $query->paginate(min(200, max(10, (int) ($validated['per_page'] ?? 50))))
        );
    }

    /**
     * Stream the filtered audit trail as CSV for governance / evidence
     * (item 13 / BR-FR-009/010, §11.3). Gated on audit.export.
     */
    public function export(Request $request): StreamedResponse
    {
        if (! $request->user()->can('audit.export')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'actor_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:80'],
            'action_prefix' => ['nullable', 'string', 'max:80'],
            'subject_type' => ['nullable', 'string', 'max:255'],
            'subject_id' => ['nullable', 'integer'],
            'project_id' => ['nullable', 'integer'],
            'actor_role' => ['nullable', 'string', 'max:80'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $events = $this->applyFilters(
            AuditEvent::query()
                ->where('organization_id', $organization->id)
                ->with(['actor:id,name', 'actorCompany:id,name,type']),
            $validated
        )->orderBy('created_at')->get();

        return response()->streamDownload(function () use ($events): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Timestamp (UTC)', 'Action', 'Actor', 'Role', 'Party', 'Subject', 'Prior', 'New', 'Reason']);

            foreach ($events as $event) {
                fputcsv($out, [
                    optional($event->created_at)->toIso8601String(),
                    $event->action,
                    $event->actor?->name ?? '',
                    $event->actor_role ?? '',
                    $event->actorCompany?->name ?? '',
                    $event->subject_type ? class_basename($event->subject_type).'#'.$event->subject_id : '',
                    $event->prior ? json_encode($event->prior) : '',
                    $event->new ? json_encode($event->new) : '',
                    $event->reason ?? '',
                ]);
            }

            fclose($out);
        }, 'audit-trail.csv', [
            'Content-Type' => 'text/csv',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function applyFilters(Builder $query, array $validated): Builder
    {
        return $query
            ->when(! empty($validated['actor_id']), fn ($q) => $q->where('actor_id', (int) $validated['actor_id']))
            ->when(! empty($validated['action']), fn ($q) => $q->where('action', $validated['action']))
            ->when(! empty($validated['action_prefix']), fn ($q) => $q->where('action', 'like', $validated['action_prefix'].'%'))
            ->when(! empty($validated['subject_type']), fn ($q) => $q->where('subject_type', $validated['subject_type']))
            ->when(! empty($validated['subject_id']), fn ($q) => $q->where('subject_id', (int) $validated['subject_id']))
            ->when(! empty($validated['project_id']), fn ($q) => $q->where('project_id', (int) $validated['project_id']))
            ->when(! empty($validated['actor_role']), fn ($q) => $q->where('actor_role', $validated['actor_role']))
            ->when(! empty($validated['date_from']), fn ($q) => $q->where('created_at', '>=', $validated['date_from']))
            ->when(! empty($validated['date_to']), fn ($q) => $q->where('created_at', '<=', $validated['date_to']));
    }
}
