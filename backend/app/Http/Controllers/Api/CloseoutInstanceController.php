<?php

namespace App\Http\Controllers\Api;

use App\Events\DashboardRealtimeMessage;
use App\Events\SnagRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\CloseoutEvidence;
use App\Models\CloseoutInstanceItem;
use App\Models\CloseoutTemplate;
use App\Models\Snag;
use App\Services\AttachmentComplianceService;
use App\Services\AccessControlService;
use App\Services\CloseoutService;
use App\Services\OpsHealthService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CloseoutInstanceController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly CloseoutService $closeoutService,
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly AccessControlService $accessControlService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function show(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('view', $snag);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.instances.view')) {
            abort(403);
        }

        $instance = $snag->closeoutInstance()
            ->with([
                'template.items',
                'items.evidences.uploader:id,name,email',
                'items.completedBy:id,name,email',
                'reviewer:id,name,email',
            ])
            ->first();

        $templates = CloseoutTemplate::query()
            ->where('organization_id', $snag->organization_id)
            ->where('is_active', true)
            ->where(function ($builder) use ($snag): void {
                $builder->where('project_id', $snag->project_id)
                    ->orWhereNull('project_id');
            })
            ->with('items')
            ->orderByDesc('is_library')
            ->orderByDesc('is_default')
            ->orderBy('discipline')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $instance,
            'meta' => [
                'templates' => $templates,
            ],
        ]);
    }

    public function upsert(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('view', $snag);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.instances.update')) {
            abort(403);
        }

        $validated = $request->validate([
            'template_id' => ['nullable', 'integer', 'exists:closeout_templates,id'],
        ]);

        $template = null;

        if (array_key_exists('template_id', $validated) && $validated['template_id']) {
            $template = CloseoutTemplate::query()->findOrFail($validated['template_id']);
        }

        if (! $template && $snag->closeoutInstance) {
            $template = $snag->closeoutInstance->template;
        }

        if (! $template) {
            $template = $this->closeoutService->chooseDefaultTemplate($snag->project);
        }

        if (! $template && ! $snag->closeoutInstance) {
            abort(422, 'No closeout template available for this snag.');
        }

        $instance = $this->closeoutService->initializeForSnag($snag->loadMissing('project'), $template, $request->user());

        $this->broadcastCloseoutUpdate($snag, 'initialized', [
            'closeout_instance_id' => $instance->id,
            'completion_percentage' => $instance->completion_percentage,
        ]);

        return response()->json([
            'data' => $instance,
        ]);
    }

    public function updateItem(Request $request, CloseoutInstanceItem $item): JsonResponse
    {
        $item->loadMissing('instance.snag');
        $instance = $item->instance;
        $snag = $instance->snag;

        $this->assertOrganization($instance->organization_id, $request);
        $this->authorize('view', $snag);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.instances.update')) {
            abort(403);
        }

        $validated = $request->validate([
            'is_completed' => ['required', 'boolean'],
            'notes' => ['nullable', 'string'],
        ]);

        $updatedInstance = $this->closeoutService->updateItem(
            $item,
            $request->user(),
            $validated['is_completed'],
            $validated['notes'] ?? null,
        );

        $this->broadcastCloseoutUpdate($snag, 'item_updated', [
            'closeout_instance_id' => $updatedInstance->id,
            'closeout_item_id' => $item->id,
            'completion_percentage' => $updatedInstance->completion_percentage,
        ]);

        return response()->json([
            'data' => $updatedInstance,
        ]);
    }

    public function uploadEvidence(Request $request, CloseoutInstanceItem $item): JsonResponse
    {
        $item->loadMissing('instance.snag');
        $instance = $item->instance;
        $snag = $instance->snag;

        $this->assertOrganization($instance->organization_id, $request);
        $this->authorize('view', $snag);
        $organization = $this->currentOrganization($request);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.instances.update')) {
            abort(403);
        }

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:51200', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi'],
            'metadata' => ['nullable', 'array'],
            'pii_redacted' => ['nullable', 'boolean'],
        ]);

        try {
            $safe = $this->uploadSecurityService->assertSafeUploadedFile($validated['file'], [
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
                (string) $validated['file']->getRealPath(),
                $safe['mime_type'],
                array_key_exists('pii_redacted', $validated) ? (bool) $validated['pii_redacted'] : null,
                'closeout_evidence',
                ['snag_id' => $snag->id, 'closeout_item_id' => $item->id, 'file_name' => $validated['file']->getClientOriginalName()],
            );
            $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);
        } catch (\Throwable $exception) {
            $this->opsHealthService->recordStorageFailure(
                $snag->organization_id,
                'closeout_evidence',
                $exception->getMessage(),
                ['snag_id' => $snag->id, 'closeout_item_id' => $item->id]
            );
            throw $exception;
        }

        $evidence = $this->closeoutService->addEvidence(
            $item,
            $request->user(),
            $validated['file'],
            [
                ...(is_array($validated['metadata'] ?? null) ? $validated['metadata'] : []),
                'security' => $compliance,
            ],
        );

        $evidence->mime_type = $safe['mime_type'];
        $evidence->file_size = $safe['file_size'];
        $evidence->save();

        $this->broadcastCloseoutUpdate($snag, 'evidence_added', [
            'closeout_instance_id' => $instance->id,
            'closeout_item_id' => $item->id,
            'evidence_id' => $evidence->id,
        ]);

        return response()->json([
            'data' => $evidence->load('uploader:id,name,email'),
        ], 201);
    }

    public function review(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('view', $snag);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.review')) {
            abort(403);
        }

        $instance = $snag->closeoutInstance;
        if (! $instance) {
            abort(422, 'Closeout instance is not initialized.');
        }

        $instance = $this->closeoutService->markReviewed($instance, $request->user());

        $this->broadcastCloseoutUpdate($snag, 'reviewed', [
            'closeout_instance_id' => $instance->id,
            'completion_percentage' => $instance->completion_percentage,
        ]);

        return response()->json([
            'data' => $instance,
        ]);
    }

    public function downloadEvidence(Request $request, CloseoutEvidence $evidence)
    {
        $evidence->loadMissing('item.instance.snag');

        $instance = $evidence->item->instance;
        $snag = $instance->snag;

        $this->assertOrganization($instance->organization_id, $request);
        $this->authorize('view', $snag);

        if (! $this->accessControlService->allows($request->user(), $snag->organization_id, $snag->project_id, 'closeout.instances.view')) {
            abort(403);
        }

        return Storage::disk('public')->download(
            $evidence->file_path,
            $evidence->file_name,
            ['Content-Type' => $evidence->mime_type]
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function broadcastCloseoutUpdate(Snag $snag, string $action, array $payload): void
    {
        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'closeout_'.$action,
            'snag_id' => $snag->id,
            ...$payload,
        ]));

        event(new DashboardRealtimeMessage($snag->organization_id, [
            'action' => 'closeout_'.$action,
            'snag_id' => $snag->id,
            'project_id' => $snag->project_id,
            ...$payload,
        ]));
    }
}
