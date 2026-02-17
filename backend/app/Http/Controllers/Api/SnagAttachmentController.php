<?php

namespace App\Http\Controllers\Api;

use App\Events\SnagRealtimeMessage;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Snag;
use App\Models\SnagAttachment;
use App\Services\AttachmentComplianceService;
use App\Services\OpsHealthService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SnagAttachmentController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function store(Request $request, Snag $snag): JsonResponse
    {
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('attach', $snag);
        $organization = $this->currentOrganization($request);

        if (is_string($request->input('markup_data'))) {
            $decodedMarkup = json_decode($request->string('markup_data')->toString(), true);
            if (is_array($decodedMarkup)) {
                $request->merge(['markup_data' => $decodedMarkup]);
            }
        }

        $validated = $request->validate([
            'client_uuid' => ['nullable', 'uuid'],
            'type' => ['required', 'in:photo,video,markup'],
            'file' => ['nullable', 'file', 'max:51200', 'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi'],
            'markup_data' => ['nullable', 'array'],
            'metadata' => ['nullable', 'array'],
            'pii_redacted' => ['nullable', 'boolean'],
        ]);

        $type = $validated['type'];
        $file = $request->file('file');

        if (in_array($type, ['photo', 'video'], true) && ! $file) {
            abort(422, 'File is required for photo and video attachments.');
        }

        if ($type === 'markup' && empty($validated['markup_data'])) {
            abort(422, 'Markup data is required for markup attachments.');
        }

        if (! empty($validated['client_uuid'])) {
            $existing = SnagAttachment::query()
                ->where('snag_id', $snag->id)
                ->where('client_uuid', $validated['client_uuid'])
                ->first();

            if ($existing) {
                return response()->json([
                    'data' => $existing,
                ]);
            }
        }

        $attributes = [
            'snag_id' => $snag->id,
            'client_uuid' => $validated['client_uuid'] ?? null,
            'organization_id' => $snag->organization_id,
            'uploaded_by' => $request->user()->id,
            'type' => $type,
            'markup_data' => $validated['markup_data'] ?? null,
            'metadata' => $validated['metadata'] ?? null,
        ];

        if ($file) {
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
                    array_key_exists('pii_redacted', $validated) ? (bool) $validated['pii_redacted'] : null,
                    'snag_attachment',
                    ['snag_id' => $snag->id, 'file_name' => $file->getClientOriginalName()],
                );
                $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);

                $path = $file->store(
                    sprintf('snags/org_%d/snag_%d', $snag->organization_id, $snag->id),
                    'public'
                );
            } catch (\Throwable $exception) {
                $this->opsHealthService->recordStorageFailure(
                    $snag->organization_id,
                    'snag_attachment',
                    $exception->getMessage(),
                    ['snag_id' => $snag->id, 'file_name' => $file->getClientOriginalName()]
                );
                throw $exception;
            }

            $attributes = [
                ...$attributes,
                'file_name' => $file->getClientOriginalName(),
                'file_path' => $path,
                'mime_type' => $safe['mime_type'],
                'file_size' => $safe['file_size'],
                'metadata' => [
                    ...(is_array($validated['metadata'] ?? null) ? $validated['metadata'] : []),
                    'security' => $compliance,
                ],
            ];
        }

        $attachment = SnagAttachment::create($attributes);

        event(new SnagRealtimeMessage($snag->organization_id, [
            'action' => 'attachment_added',
            'snag_id' => $snag->id,
            'attachment_id' => $attachment->id,
            'actor_id' => $request->user()->id,
        ]));

        return response()->json([
            'data' => $attachment,
        ], 201);
    }

    public function download(Request $request, SnagAttachment $attachment)
    {
        $this->assertOrganization($attachment->organization_id, $request);

        $snag = Snag::query()->findOrFail($attachment->snag_id);
        $this->authorize('view', $snag);

        if (! $attachment->file_path) {
            return response()->json([
                'data' => [
                    'id' => $attachment->id,
                    'type' => $attachment->type,
                    'markup_data' => $attachment->markup_data,
                    'metadata' => $attachment->metadata,
                ],
            ]);
        }

        return Storage::disk('public')->download(
            $attachment->file_path,
            $attachment->file_name,
            ['Content-Type' => $attachment->mime_type]
        );
    }
}

