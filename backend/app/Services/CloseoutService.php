<?php

namespace App\Services;

use App\Models\CloseoutEvidence;
use App\Models\CloseoutInstance;
use App\Models\CloseoutInstanceItem;
use App\Models\CloseoutTemplate;
use App\Models\Project;
use App\Models\Snag;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;

class CloseoutService
{
    public function initializeForSnag(Snag $snag, ?CloseoutTemplate $template, User $actor): CloseoutInstance
    {
        if ($template) {
            $this->assertTemplateOwnership($snag, $template);
        }

        $instance = CloseoutInstance::query()->firstOrNew([
            'snag_id' => $snag->id,
        ]);

        $shouldRebuildItems = false;

        if (! $instance->exists) {
            $instance->organization_id = $snag->organization_id;
            $instance->project_id = $snag->project_id;
            $instance->created_by = $actor->id;
            $instance->status = 'not_started';
            $instance->completion_percentage = 0;
            $instance->closeout_template_id = $template?->id;
            $instance->save();
            $shouldRebuildItems = true;
        }

        if ($template && $instance->closeout_template_id !== $template->id) {
            $instance->closeout_template_id = $template->id;
            $instance->save();
            $instance->items()->delete();
            $shouldRebuildItems = true;
        }

        if ($instance->items()->count() === 0) {
            $shouldRebuildItems = true;
        }

        if ($shouldRebuildItems) {
            $this->seedInstanceItems($instance, $template);
        }

        return $this->refreshInstanceProgress($instance->fresh(['items.evidences']));
    }

    public function chooseDefaultTemplate(Project $project): ?CloseoutTemplate
    {
        return CloseoutTemplate::query()
            ->where('organization_id', $project->organization_id)
            ->where('is_active', true)
            ->where(function ($query) use ($project): void {
                $query->where('project_id', $project->id)
                    ->orWhereNull('project_id');
            })
            ->orderByDesc('project_id')
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->with('items')
            ->first();
    }

    public function refreshInstanceProgress(CloseoutInstance $instance): CloseoutInstance
    {
        $instance->loadMissing('items.evidences');

        $requiredItems = $instance->items->filter(fn (CloseoutInstanceItem $item) => $item->required);
        $requiredCount = $requiredItems->count();

        $satisfiedCount = $requiredItems
            ->filter(fn (CloseoutInstanceItem $item) => $item->is_satisfied)
            ->count();

        $completion = $requiredCount === 0
            ? 100
            : (int) round(($satisfiedCount / $requiredCount) * 100);

        $status = match (true) {
            $completion === 0 => 'not_started',
            $completion < 100 => 'in_progress',
            default => 'completed',
        };

        $instance->completion_percentage = $completion;
        $instance->status = $instance->reviewed_at ? 'reviewed' : $status;

        if ($completion === 100) {
            $instance->completed_at ??= Carbon::now();
        } else {
            $instance->completed_at = null;
            $instance->reviewed_at = null;
            $instance->reviewed_by = null;
        }

        $instance->save();

        return $instance->fresh([
            'template.items',
            'items.evidences',
            'items.completedBy:id,name,email',
            'reviewer:id,name,email',
        ]);
    }

    public function updateItem(CloseoutInstanceItem $item, User $actor, bool $isCompleted, ?string $notes): CloseoutInstance
    {
        $item->is_completed = $isCompleted;
        $item->completed_at = $isCompleted ? Carbon::now() : null;
        $item->completed_by = $isCompleted ? $actor->id : null;
        $item->notes = $notes;
        $item->save();

        return $this->refreshInstanceProgress($item->instance()->firstOrFail());
    }

    /**
     * @param  array<string, mixed>|null  $metadata
     */
    public function addEvidence(CloseoutInstanceItem $item, User $actor, UploadedFile $file, ?array $metadata = null): CloseoutEvidence
    {
        $instance = $item->instance()->firstOrFail();

        $path = $file->store(
            sprintf('closeout/org_%d/snag_%d/item_%d', $instance->organization_id, $instance->snag_id, $item->id),
            'public'
        );

        $evidence = CloseoutEvidence::query()->create([
            'organization_id' => $instance->organization_id,
            'closeout_instance_item_id' => $item->id,
            'uploaded_by' => $actor->id,
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'mime_type' => $file->getClientMimeType() ?? 'application/octet-stream',
            'file_size' => $file->getSize(),
            'metadata' => $metadata,
        ]);

        $this->refreshInstanceProgress($instance);

        return $evidence;
    }

    public function canCloseSnag(Snag $snag): bool
    {
        $instance = $snag->closeoutInstance;

        if (! $instance) {
            return false;
        }

        if ($instance->items()->count() === 0) {
            return false;
        }

        $instance = $this->refreshInstanceProgress($instance);

        return $instance->completion_percentage === 100;
    }

    /**
     * Read-only close-eligibility check using already-loaded relations.
     *
     * Equivalent to canCloseSnag() but WITHOUT the save()/fresh() write path and the
     * extra COUNT query, so it is safe to call from read-only (GET) request handlers.
     * Relies on the caller having eager-loaded closeoutInstance.items.evidences
     * (loadMissing is a no-op then); is_satisfied uses the loaded evidences collection.
     */
    public function isCloseoutCompleteFromLoaded(Snag $snag): bool
    {
        $instance = $snag->closeoutInstance;

        if (! $instance) {
            return false;
        }

        $instance->loadMissing('items.evidences');
        $items = $instance->items;

        if ($items->isEmpty()) {
            return false;
        }

        $requiredItems = $items->filter(fn (CloseoutInstanceItem $item) => $item->required);

        // Mirrors refreshInstanceProgress(): no required items => 100% complete.
        if ($requiredItems->isEmpty()) {
            return true;
        }

        return $requiredItems->every(fn (CloseoutInstanceItem $item) => $item->is_satisfied);
    }

    public function markReviewed(CloseoutInstance $instance, User $reviewer): CloseoutInstance
    {
        $instance = $this->refreshInstanceProgress($instance);

        if ($instance->completion_percentage < 100) {
            abort(422, 'Closeout cannot be reviewed before completion reaches 100%.');
        }

        $instance->reviewed_at = Carbon::now();
        $instance->reviewed_by = $reviewer->id;
        $instance->status = 'reviewed';
        $instance->save();

        return $instance->fresh([
            'template.items',
            'items.evidences',
            'items.completedBy:id,name,email',
            'reviewer:id,name,email',
        ]);
    }

    private function seedInstanceItems(CloseoutInstance $instance, ?CloseoutTemplate $template): void
    {
        $templateItems = $template?->items ?? collect();

        foreach ($templateItems as $templateItem) {
            $instance->items()->create([
                'closeout_template_item_id' => $templateItem->id,
                'title' => $templateItem->title,
                'description' => $templateItem->description,
                'required' => $templateItem->required,
                'evidence_required' => $templateItem->evidence_required,
                'is_completed' => false,
            ]);
        }
    }

    private function assertTemplateOwnership(Snag $snag, CloseoutTemplate $template): void
    {
        if ($template->organization_id !== $snag->organization_id) {
            abort(422, 'Template does not belong to this organization.');
        }

        if ($template->project_id && $template->project_id !== $snag->project_id) {
            abort(422, 'Template does not belong to this project.');
        }
    }
}
