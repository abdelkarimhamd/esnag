<?php

namespace App\Services;

use App\Enums\SnagStatus;
use App\Models\MobileSyncProcessedOperation;
use App\Models\Organization;
use App\Models\RootCauseCategory;
use App\Models\Snag;
use App\Models\SnagComment;
use App\Models\SnagStatusHistory;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MobileSyncService
{
    public function __construct(
        private readonly SnagTransitionService $snagTransitionService,
        private readonly SnagCollaborationService $snagCollaborationService,
    ) {
    }

    /**
     * @param  array<int, array<string, mixed>>  $operations
     * @return array<int, array<string, mixed>>
     */
    public function apply(Organization $organization, User $actor, array $operations): array
    {
        $results = [];

        foreach ($operations as $index => $operation) {
            $hasClientOpId = isset($operation['op_id'])
                && is_scalar($operation['op_id'])
                && trim((string) $operation['op_id']) !== '';
            $opId = $hasClientOpId ? (string) $operation['op_id'] : Str::uuid()->toString();
            $type = (string) ($operation['type'] ?? '');
            $payload = is_array($operation['payload'] ?? null) ? $operation['payload'] : [];
            $clientUpdatedAt = $this->parseClientTimestamp($operation['client_updated_at'] ?? null);

            // Idempotency: if this client op_id already committed on a prior request
            // whose response was lost, replay the original result instead of re-running
            // the handler (which would otherwise produce a phantom conflict on
            // snag.update or a false rejection on snag.transition).
            if ($hasClientOpId && ($cached = $this->findProcessedOperation($organization->id, $opId)) !== null) {
                $results[] = array_merge(
                    ['op_id' => $opId, 'status' => (string) $cached->status],
                    is_array($cached->result) ? $cached->result : [],
                );

                continue;
            }

            try {
                $results[] = DB::transaction(function () use ($type, $organization, $actor, $payload, $clientUpdatedAt, $opId, $hasClientOpId) {
                    $resultPayload = match ($type) {
                        'snag.create' => $this->handleSnagCreate($organization, $actor, $payload),
                        'snag.update' => $this->handleSnagUpdate($organization, $actor, $payload, $clientUpdatedAt),
                        'snag.transition' => $this->handleSnagTransition($organization, $actor, $payload),
                        'snag.comment.create' => $this->handleSnagCommentCreate($organization, $actor, $payload),
                        default => throw ValidationException::withMessages([
                            'type' => ['Unsupported operation type.'],
                        ]),
                    };

                    $entry = [
                        'op_id' => $opId,
                        'status' => 'applied',
                        'result' => $resultPayload,
                    ];

                    // Remember only genuinely-applied (non-conflict) operations, atomically
                    // with the data write. Conflicts wrote nothing (so a later real apply can
                    // still be remembered) and rejected/failed ops are intentionally retryable.
                    $isConflict = is_array($resultPayload) && ($resultPayload['conflict'] ?? false) === true;
                    if ($hasClientOpId && ! $isConflict) {
                        $this->rememberProcessedOperation($organization->id, $opId, $entry);
                    }

                    return $entry;
                });
            } catch (ValidationException $exception) {
                $results[] = [
                    'op_id' => $opId,
                    'status' => 'rejected',
                    'errors' => $exception->errors(),
                ];
            } catch (\Throwable $exception) {
                report($exception);

                $results[] = [
                    'op_id' => $opId,
                    'status' => 'failed',
                    'message' => $exception->getMessage(),
                ];
            }
        }

        return $results;
    }

    /**
     * @return array<string, mixed>
     */
    private function handleSnagCreate(Organization $organization, User $actor, array $payload): array
    {
        $validator = validator($payload, [
            'client_uuid' => ['nullable', 'uuid'],
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'drawing_id' => ['required', 'integer', 'exists:drawings,id'],
            'drawing_revision_id' => ['nullable', 'integer', 'exists:drawing_revisions,id'],
            'building_id' => ['nullable', 'integer', 'exists:buildings,id'],
            'floor_id' => ['nullable', 'integer', 'exists:floors,id'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'root_cause_category_id' => ['nullable', 'integer', 'exists:root_cause_categories,id'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipments,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['nullable', 'in:low,medium,high,critical'],
            'pin_x' => ['required', 'numeric', 'min:0', 'max:1'],
            'pin_y' => ['required', 'numeric', 'min:0', 'max:1'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'due_date' => ['nullable', 'date'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages($validator->errors()->toArray());
        }

        $validated = $validator->validated();

        if (! empty($validated['root_cause_category_id'])) {
            $category = RootCauseCategory::query()->findOrFail((int) $validated['root_cause_category_id']);
            if ($category->organization_id !== $organization->id) {
                throw ValidationException::withMessages([
                    'root_cause_category_id' => ['Root cause category does not belong to this organization.'],
                ]);
            }
        }

        if (! empty($validated['client_uuid'])) {
            $existing = Snag::query()
                ->where('organization_id', $organization->id)
                ->where('client_uuid', $validated['client_uuid'])
                ->first();

            if ($existing) {
                return [
                    'snag_id' => $existing->id,
                    'reference' => $existing->reference,
                    'updated_at' => optional($existing->updated_at)->toISOString(),
                ];
            }
        }

        $status = ! empty($validated['assigned_to'])
            ? SnagStatus::Assigned->value
            : SnagStatus::New->value;

        $snag = Snag::query()->create([
            ...$validated,
            'organization_id' => $organization->id,
            'reference' => $this->nextReference($organization->id),
            'client_uuid' => $validated['client_uuid'] ?? null,
            'priority' => $validated['priority'] ?? 'medium',
            'status' => $status,
            'created_by' => $actor->id,
            'acknowledged_at' => $status === SnagStatus::Assigned->value ? now() : null,
        ]);

        SnagStatusHistory::query()->create([
            'snag_id' => $snag->id,
            'organization_id' => $organization->id,
            'from_status' => null,
            'to_status' => $status,
            'changed_by' => $actor->id,
            'note' => 'Created by mobile sync.',
        ]);

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $actor->id);

        return [
            'snag_id' => $snag->id,
            'reference' => $snag->reference,
            'status' => $snag->status,
            'updated_at' => optional($snag->updated_at)->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function handleSnagUpdate(Organization $organization, User $actor, array $payload, ?Carbon $clientUpdatedAt): array
    {
        $validator = validator($payload, [
            'snag_id' => ['required', 'integer', 'exists:snags,id'],
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'priority' => ['sometimes', 'required', 'in:low,medium,high,critical'],
            'pin_x' => ['sometimes', 'required', 'numeric', 'min:0', 'max:1'],
            'pin_y' => ['sometimes', 'required', 'numeric', 'min:0', 'max:1'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'due_date' => ['nullable', 'date'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipments,id'],
            'root_cause_category_id' => ['nullable', 'integer', 'exists:root_cause_categories,id'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'estimated_hours' => ['nullable', 'numeric', 'min:0'],
            'status' => ['prohibited'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages($validator->errors()->toArray());
        }

        $validated = $validator->validated();
        $snag = Snag::query()->findOrFail($validated['snag_id']);

        if ($snag->organization_id !== $organization->id) {
            throw ValidationException::withMessages([
                'snag_id' => ['Snag does not belong to this organization.'],
            ]);
        }

        if ($clientUpdatedAt && $snag->updated_at && $clientUpdatedAt->lt($snag->updated_at)) {
            $localPreview = [
                'snag_id' => $snag->id,
                'title' => $validated['title'] ?? $snag->title,
                'description' => array_key_exists('description', $validated) ? $validated['description'] : $snag->description,
                'priority' => $validated['priority'] ?? $snag->priority,
                'assigned_to' => array_key_exists('assigned_to', $validated) ? $validated['assigned_to'] : $snag->assigned_to,
                'due_date' => array_key_exists('due_date', $validated) ? $validated['due_date'] : $snag->due_date,
                'updated_at' => $clientUpdatedAt->toISOString(),
            ];

            return [
                'conflict' => true,
                'policy' => 'last_write_wins',
                'resolution_options' => ['use_server', 'retry_local', 'merge'],
                'local' => $localPreview,
                'server' => [
                    'snag_id' => $snag->id,
                    'title' => $snag->title,
                    'description' => $snag->description,
                    'priority' => $snag->priority,
                    'status' => $snag->status,
                    'updated_at' => optional($snag->updated_at)->toISOString(),
                ],
            ];
        }

        if (array_key_exists('root_cause_category_id', $validated) && $validated['root_cause_category_id']) {
            $category = RootCauseCategory::query()->findOrFail((int) $validated['root_cause_category_id']);
            if ($category->organization_id !== $organization->id) {
                throw ValidationException::withMessages([
                    'root_cause_category_id' => ['Root cause category does not belong to this organization.'],
                ]);
            }
        }

        $snag->fill([
            'title' => $validated['title'] ?? $snag->title,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $snag->description,
            'priority' => $validated['priority'] ?? $snag->priority,
            'pin_x' => $validated['pin_x'] ?? $snag->pin_x,
            'pin_y' => $validated['pin_y'] ?? $snag->pin_y,
            'assigned_to' => array_key_exists('assigned_to', $validated) ? $validated['assigned_to'] : $snag->assigned_to,
            'due_date' => array_key_exists('due_date', $validated) ? $validated['due_date'] : $snag->due_date,
            'equipment_id' => array_key_exists('equipment_id', $validated) ? $validated['equipment_id'] : $snag->equipment_id,
            'root_cause_category_id' => array_key_exists('root_cause_category_id', $validated) ? $validated['root_cause_category_id'] : $snag->root_cause_category_id,
            'estimated_cost' => array_key_exists('estimated_cost', $validated) ? $validated['estimated_cost'] : $snag->estimated_cost,
            'estimated_hours' => array_key_exists('estimated_hours', $validated) ? $validated['estimated_hours'] : $snag->estimated_hours,
        ]);

        if ($snag->assigned_to && ! $snag->acknowledged_at) {
            $snag->acknowledged_at = now();
        }
        $snag->save();

        $this->snagCollaborationService->autoWatchDefaultStakeholders($snag, $actor->id);

        return [
            'snag_id' => $snag->id,
            'status' => $snag->status,
            'updated_at' => optional($snag->updated_at)->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function handleSnagTransition(Organization $organization, User $actor, array $payload): array
    {
        $validator = validator($payload, [
            'snag_id' => ['required', 'integer', 'exists:snags,id'],
            'to_status' => ['required', 'string', 'in:new,assigned,in_progress,ready_for_review,closed,rejected'],
            'note' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages($validator->errors()->toArray());
        }

        $validated = $validator->validated();
        $snag = Snag::query()->findOrFail($validated['snag_id']);
        if ($snag->organization_id !== $organization->id) {
            throw ValidationException::withMessages([
                'snag_id' => ['Snag does not belong to this organization.'],
            ]);
        }

        $updated = $this->snagTransitionService->transition(
            $snag,
            $actor,
            $validated['to_status'],
            $validated['note'] ?? null,
            array_key_exists('assigned_to', $validated) ? (int) ($validated['assigned_to'] ?? 0) : null
        );

        return [
            'snag_id' => $updated->id,
            'status' => $updated->status,
            'updated_at' => optional($updated->updated_at)->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function handleSnagCommentCreate(Organization $organization, User $actor, array $payload): array
    {
        $validator = validator($payload, [
            'snag_id' => ['required', 'integer', 'exists:snags,id'],
            'client_uuid' => ['nullable', 'uuid'],
            'parent_id' => ['nullable', 'integer', 'exists:snag_comments,id'],
            'body' => ['required', 'string'],
            'is_internal' => ['sometimes', 'boolean'],
            'mention_user_ids' => ['nullable', 'array'],
            'mention_user_ids.*' => ['integer', 'exists:users,id'],
            'mention_team_ids' => ['nullable', 'array'],
            'mention_team_ids.*' => ['integer', 'exists:stakeholder_teams,id'],
        ]);

        if ($validator->fails()) {
            throw ValidationException::withMessages($validator->errors()->toArray());
        }

        $validated = $validator->validated();
        $snag = Snag::query()->findOrFail($validated['snag_id']);
        if ($snag->organization_id !== $organization->id) {
            throw ValidationException::withMessages([
                'snag_id' => ['Snag does not belong to this organization.'],
            ]);
        }

        if (! empty($validated['parent_id'])) {
            $parent = SnagComment::query()->findOrFail((int) $validated['parent_id']);
            if ($parent->snag_id !== $snag->id) {
                throw ValidationException::withMessages([
                    'parent_id' => ['Parent comment does not belong to this snag.'],
                ]);
            }
        }

        if (! empty($validated['client_uuid'])) {
            $existing = SnagComment::query()
                ->where('snag_id', $snag->id)
                ->where('client_uuid', $validated['client_uuid'])
                ->first();

            if ($existing) {
                return [
                    'comment_id' => $existing->id,
                    'created_at' => optional($existing->created_at)->toISOString(),
                ];
            }
        }

        $comment = SnagComment::query()->create([
            'snag_id' => $snag->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'client_uuid' => $validated['client_uuid'] ?? null,
            'organization_id' => $organization->id,
            'user_id' => $actor->id,
            'body' => $validated['body'],
            'is_internal' => (bool) ($validated['is_internal'] ?? false),
        ]);

        $mentionResult = $this->snagCollaborationService->resolveMentions(
            $snag,
            $validated['body'],
            collect($validated['mention_user_ids'] ?? [])->map(fn ($id) => (int) $id)->all(),
            collect($validated['mention_team_ids'] ?? [])->map(fn ($id) => (int) $id)->all(),
        );
        $this->snagCollaborationService->persistMentions($comment, $mentionResult['mention_rows']);

        $this->snagCollaborationService->autoWatchCommentActor($snag, $actor->id);
        $this->snagCollaborationService->addWatchers(
            $snag,
            $mentionResult['users']->pluck('id')->all(),
            SnagCollaborationService::WATCH_SOURCE_MENTION,
            $actor->id,
        );
        $this->snagCollaborationService->addWatchers(
            $snag,
            $mentionResult['team_member_ids'],
            SnagCollaborationService::WATCH_SOURCE_TEAM_MENTION,
            $actor->id,
        );

        return [
            'comment_id' => $comment->id,
            'created_at' => optional($comment->created_at)->toISOString(),
        ];
    }

    private function findProcessedOperation(int $organizationId, string $opId): ?MobileSyncProcessedOperation
    {
        return MobileSyncProcessedOperation::query()
            ->where('organization_id', $organizationId)
            ->where('op_id', $opId)
            ->first();
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function rememberProcessedOperation(int $organizationId, string $opId, array $entry): void
    {
        MobileSyncProcessedOperation::query()->updateOrCreate(
            ['organization_id' => $organizationId, 'op_id' => $opId],
            [
                'status' => $entry['status'],
                'result' => Arr::except($entry, ['op_id', 'status']),
                'processed_at' => Carbon::now(),
            ],
        );
    }

    private function parseClientTimestamp(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function nextReference(int $organizationId): string
    {
        $next = Snag::query()
            ->where('organization_id', $organizationId)
            ->count() + 1;

        return 'SNG-'.str_pad((string) $next, 5, '0', STR_PAD_LEFT);
    }
}
