<?php

namespace App\Observers;

use App\Services\AuditRecorder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Records master-data and workflow-config mutations into the unified audit
 * stream (item 9 / BR-BR-013). Registered in {@see \App\Providers\AppServiceProvider}
 * for the auditable master-data models, so every create/update/delete is
 * captured regardless of which controller performed it.
 *
 * Only records when an authenticated actor is present — seeder / console /
 * system writes are intentionally not audited.
 */
class AuditableModelObserver
{
    /** Attributes never worth storing in the before/after snapshot. */
    private const IGNORED = ['created_at', 'updated_at'];

    public function __construct(private readonly AuditRecorder $recorder)
    {
    }

    public function created(Model $model): void
    {
        $this->record($model, 'created', null, $this->snapshot($model->getAttributes()));
    }

    public function updated(Model $model): void
    {
        $changes = $model->getChanges();
        $prior = [];
        foreach (array_keys($changes) as $key) {
            $prior[$key] = $model->getOriginal($key);
        }

        // Nothing meaningful changed (e.g. only timestamps touched).
        if ($this->snapshot($changes) === []) {
            return;
        }

        $this->record($model, 'updated', $this->snapshot($prior), $this->snapshot($changes));
    }

    public function deleted(Model $model): void
    {
        $this->record($model, 'deleted', $this->snapshot($model->getAttributes()), null);
    }

    /**
     * @param  array<string, mixed>|null  $prior
     * @param  array<string, mixed>|null  $new
     */
    private function record(Model $model, string $event, ?array $prior, ?array $new): void
    {
        if (! Auth::check()) {
            return;
        }

        $organizationId = (int) ($model->getAttribute('organization_id') ?? 0);
        if ($organizationId <= 0) {
            return;
        }

        $projectId = $model->getAttribute('project_id');

        $this->recorder->record(
            $organizationId,
            Auth::user(),
            strtolower(class_basename($model)).'.'.$event,
            $model,
            $projectId ? (int) $projectId : null,
            $prior,
            $new,
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function snapshot(array $attributes): array
    {
        return array_diff_key($attributes, array_flip(self::IGNORED));
    }
}
