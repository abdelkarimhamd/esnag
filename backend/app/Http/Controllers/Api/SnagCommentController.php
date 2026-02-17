<?php

namespace App\Http\Controllers\Api;

use App\Events\SnagRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Snag;
use App\Models\SnagComment;
use App\Models\SnagCommentAttachment;
use App\Models\User;
use App\Notifications\SnagCommentAddedNotification;
use App\Notifications\SnagMentionedNotification;
use App\Services\AttachmentComplianceService;
use App\Services\OpsHealthService;
use App\Services\PushNotificationService;
use App\Services\SnagCollaborationService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

class SnagCommentController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly PushNotificationService $pushNotificationService,
        private readonly SnagCollaborationService $snagCollaborationService,
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function store(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('comment', $snag);
        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'client_uuid' => ['nullable', 'uuid'],
            'parent_id' => ['nullable', 'integer', 'exists:snag_comments,id'],
            'body' => ['required', 'string'],
            'is_internal' => ['sometimes', 'boolean'],
            'mention_user_ids' => ['nullable', 'array'],
            'mention_user_ids.*' => ['integer', 'exists:users,id'],
            'mention_team_ids' => ['nullable', 'array'],
            'mention_team_ids.*' => ['integer', 'exists:stakeholder_teams,id'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:51200', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi'],
            'pii_redacted' => ['nullable', 'boolean'],
        ]);

        if (! empty($validated['parent_id'])) {
            $parent = SnagComment::query()->findOrFail((int) $validated['parent_id']);
            if ($parent->snag_id !== $snag->id) {
                abort(422, 'Parent comment does not belong to this snag.');
            }
        }

        if (! empty($validated['client_uuid'])) {
            $existing = SnagComment::query()
                ->where('snag_id', $snag->id)
                ->where('client_uuid', $validated['client_uuid'])
                ->first();

            if ($existing) {
                return response()->json([
                    'data' => $existing->load([
                        'user:id,name,email',
                        'attachments',
                        'mentions.mentionedUser:id,name,email',
                        'mentions.mentionedTeam:id,name,code',
                    ]),
                ]);
            }
        }

        $comment = SnagComment::query()->create([
            'snag_id' => $snag->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'client_uuid' => $validated['client_uuid'] ?? null,
            'organization_id' => $snag->organization_id,
            'user_id' => $request->user()->id,
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

        $attachments = $this->storeCommentAttachments(
            $request,
            $organization,
            $snag,
            $comment,
            array_key_exists('pii_redacted', $validated) ? (bool) $validated['pii_redacted'] : null,
        );

        $this->snagCollaborationService->autoWatchCommentActor($snag, $request->user()->id);
        $this->snagCollaborationService->addWatchers(
            $snag,
            $mentionResult['users']->pluck('id')->all(),
            SnagCollaborationService::WATCH_SOURCE_MENTION,
            $request->user()->id,
        );
        $this->snagCollaborationService->addWatchers(
            $snag,
            $mentionResult['team_member_ids'],
            SnagCollaborationService::WATCH_SOURCE_TEAM_MENTION,
            $request->user()->id,
        );

        $teamMentionUsers = User::query()
            ->whereIn('id', $mentionResult['team_member_ids'])
            ->whereHas('organizations', function ($query) use ($snag): void {
                $query->where('organizations.id', $snag->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->get();

        $mentionedRecipients = $mentionResult['users']
            ->merge($teamMentionUsers)
            ->filter()
            ->unique('id')
            ->reject(fn (User $user) => $user->id === $request->user()->id)
            ->values();

        $generalRecipients = $this->snagCollaborationService
            ->notificationRecipientsForComment($snag, $request->user()->id)
            ->reject(fn (User $user) => $mentionedRecipients->contains('id', $user->id))
            ->values();

        foreach ($generalRecipients as $recipient) {
            $recipient->notify(new SnagCommentAddedNotification($snag, $comment, $request->user()));
        }

        $this->pushNotificationService->sendToUsers(
            $snag->organization_id,
            $generalRecipients,
            'New Snag Comment',
            $snag->reference.' received a new comment.',
            'esnagging://snags/'.$snag->id,
            [
                'type' => 'snag_comment_added',
                'snag_id' => $snag->id,
                'snag_reference' => $snag->reference,
                'organization_id' => $snag->organization_id,
            ],
            'immediate_comment',
        );

        foreach ($mentionedRecipients as $recipient) {
            $recipient->notify(new SnagMentionedNotification($snag, $comment, $request->user()));
        }

        $this->pushNotificationService->sendToUsers(
            $snag->organization_id,
            $mentionedRecipients,
            'You were mentioned',
            sprintf('%s mentioned you on %s.', $request->user()->name, $snag->reference),
            'esnagging://snags/'.$snag->id,
            [
                'type' => 'snag_mentioned',
                'snag_id' => $snag->id,
                'snag_reference' => $snag->reference,
                'comment_id' => $comment->id,
                'organization_id' => $snag->organization_id,
            ],
            'immediate_mention',
        );

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'comment_added',
            'snag_id' => $snag->id,
            'comment_id' => $comment->id,
            'parent_id' => $comment->parent_id,
            'attachments_count' => $attachments->count(),
            'actor_id' => $request->user()->id,
        ]));

        return response()->json([
            'data' => $comment->load([
                'user:id,name,email',
                'attachments',
                'mentions.mentionedUser:id,name,email',
                'mentions.mentionedTeam:id,name,code',
            ]),
        ], 201);
    }

    public function storeAttachment(Request $request, SnagComment $comment): JsonResponse
    {
        $this->assertOrganization($comment->organization_id, $request);

        $snag = Snag::query()->findOrFail($comment->snag_id);
        $this->authorize('comment', $snag);
        $organization = $this->currentOrganization($request);

        $request->validate([
            'file' => ['required', 'file', 'max:51200', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi'],
            'type' => ['nullable', 'string', 'max:30'],
            'metadata' => ['nullable', 'array'],
            'pii_redacted' => ['nullable', 'boolean'],
        ]);

        $file = $request->file('file');
        $attachment = $this->createAttachmentRecord(
            $file,
            $organization,
            $snag,
            $comment,
            $request->user()->id,
            $request->input('type'),
            is_array($request->input('metadata')) ? $request->input('metadata') : null,
            $request->has('pii_redacted') ? $request->boolean('pii_redacted') : null,
        );

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'comment_attachment_added',
            'snag_id' => $snag->id,
            'comment_id' => $comment->id,
            'attachment_id' => $attachment->id,
            'actor_id' => $request->user()->id,
        ]));

        return response()->json([
            'data' => $attachment,
        ], 201);
    }

    public function downloadAttachment(Request $request, SnagCommentAttachment $attachment)
    {
        $this->assertOrganization($attachment->organization_id, $request);

        $comment = SnagComment::query()->findOrFail($attachment->snag_comment_id);
        $snag = Snag::query()->findOrFail($comment->snag_id);
        $this->authorize('view', $snag);

        return Storage::disk('public')->download(
            $attachment->file_path,
            $attachment->file_name,
            ['Content-Type' => $attachment->mime_type]
        );
    }

    /**
     * @return Collection<int, SnagCommentAttachment>
     */
    private function storeCommentAttachments(
        Request $request,
        Organization $organization,
        Snag $snag,
        SnagComment $comment,
        ?bool $piiRedacted = null,
    ): Collection
    {
        $files = $request->file('attachments', []);
        if ($files instanceof UploadedFile) {
            $files = [$files];
        }

        if (! is_array($files) || $files === []) {
            return collect();
        }

        $created = collect();

        foreach ($files as $file) {
            if (! $file instanceof UploadedFile) {
                continue;
            }

            $created->push($this->createAttachmentRecord($file, $organization, $snag, $comment, $request->user()->id, null, null, $piiRedacted));
        }

        return $created;
    }

    private function createAttachmentRecord(
        UploadedFile $file,
        Organization $organization,
        Snag $snag,
        SnagComment $comment,
        int $uploadedBy,
        ?string $type = null,
        ?array $metadata = null,
        ?bool $piiRedacted = null,
    ): SnagCommentAttachment {
        try {
            $safe = $this->uploadSecurityService->assertSafeUploadedFile($file, [
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf',
                'video/mp4',
                'video/quicktime',
                'video/x-msvideo',
            ], 52428800);
            $compliance = $this->attachmentComplianceService->evaluate(
                $organization,
                (string) $file->getRealPath(),
                $safe['mime_type'],
                $piiRedacted,
                'snag_comment_attachment',
                ['snag_id' => $snag->id, 'comment_id' => $comment->id, 'file_name' => $file->getClientOriginalName()],
            );
            $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);

            $path = $file->store(
                sprintf('snags/org_%d/snag_%d/comments/comment_%d', $snag->organization_id, $snag->id, $comment->id),
                'public'
            );
        } catch (\Throwable $exception) {
            $this->opsHealthService->recordStorageFailure(
                $snag->organization_id,
                'snag_comment_attachment',
                $exception->getMessage(),
                ['snag_id' => $snag->id, 'comment_id' => $comment->id, 'file_name' => $file->getClientOriginalName()]
            );
            throw $exception;
        }

        return SnagCommentAttachment::query()->create([
            'organization_id' => $snag->organization_id,
            'snag_comment_id' => $comment->id,
            'uploaded_by' => $uploadedBy,
            'type' => $type ?: 'file',
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'mime_type' => $safe['mime_type'],
            'file_size' => $safe['file_size'],
            'metadata' => [
                ...(is_array($metadata) ? $metadata : []),
                'security' => $compliance,
            ],
        ]);
    }
}
