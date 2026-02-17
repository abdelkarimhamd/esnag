<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\MobileAttachmentUploadSession;
use App\Models\Snag;
use App\Models\SnagAttachment;
use App\Services\AttachmentComplianceService;
use App\Services\OpsHealthService;
use App\Services\UploadSecurityService;
use App\Services\UsageLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MobileChunkedAttachmentController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly UploadSecurityService $uploadSecurityService,
        private readonly AttachmentComplianceService $attachmentComplianceService,
        private readonly UsageLimitService $usageLimitService,
        private readonly OpsHealthService $opsHealthService,
    ) {
    }

    public function init(Request $request): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $validated = $request->validate([
            'snag_id' => ['required', 'integer', 'exists:snags,id'],
            'file_name' => ['required', 'string', 'max:255'],
            'mime_type' => ['required', 'string', 'max:120'],
            'total_chunks' => ['required', 'integer', 'min:1', 'max:500'],
            'file_size' => ['nullable', 'integer', 'min:1', 'max:104857600'],
            'client_uuid' => ['nullable', 'uuid'],
            'pii_redacted' => ['nullable', 'boolean'],
        ]);

        $snag = Snag::query()->findOrFail($validated['snag_id']);
        $this->assertOrganization($snag->organization_id, $request);
        $this->authorize('attach', $snag);

        $uploadUuid = Str::uuid()->toString();
        $tempDir = sprintf('chunks/org_%d/%s', $organization->id, $uploadUuid);
        Storage::disk('local')->makeDirectory($tempDir);

        $session = MobileAttachmentUploadSession::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $request->user()->id,
            'snag_id' => $snag->id,
            'upload_uuid' => $uploadUuid,
            'file_name' => $validated['file_name'],
            'mime_type' => $validated['mime_type'],
            'total_chunks' => $validated['total_chunks'],
            'received_chunks' => [],
            'file_size' => $validated['file_size'] ?? null,
            'pii_redacted' => array_key_exists('pii_redacted', $validated) ? (bool) $validated['pii_redacted'] : null,
            'status' => 'initiated',
            'temp_dir' => $tempDir,
            'expires_at' => Carbon::now()->addHours(6),
        ]);

        return response()->json([
            'data' => [
                'upload_session_id' => $session->id,
                'upload_uuid' => $session->upload_uuid,
                'total_chunks' => $session->total_chunks,
            ],
        ], 201);
    }

    public function chunk(Request $request, MobileAttachmentUploadSession $session): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $this->assertOrganization($session->organization_id, $request);
        if ($session->user_id !== $request->user()->id) {
            abort(403);
        }

        $session->refresh();
        if ($session->status === 'completed') {
            return response()->json([
                'data' => [
                    'upload_session_id' => $session->id,
                    'status' => $session->status,
                    'received_chunks' => $session->received_chunks,
                ],
            ]);
        }

        if ($session->expires_at && Carbon::now()->greaterThan($session->expires_at)) {
            abort(422, 'Upload session expired.');
        }

        $validated = $request->validate([
            'chunk_index' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file', 'max:10240'],
        ]);

        if ($validated['chunk_index'] >= $session->total_chunks) {
            throw ValidationException::withMessages([
                'chunk_index' => ['Chunk index exceeds declared total_chunks.'],
            ]);
        }

        $chunkPath = sprintf('%s/chunk_%05d.part', $session->temp_dir, $validated['chunk_index']);
        Storage::disk('local')->putFileAs($session->temp_dir, $validated['chunk'], basename($chunkPath));

        $receivedChunks = collect($session->received_chunks ?? [])
            ->map(fn ($value) => (int) $value)
            ->push((int) $validated['chunk_index'])
            ->unique()
            ->sort()
            ->values()
            ->all();

        $session->received_chunks = $receivedChunks;
        $session->status = 'uploading';
        $session->save();

        return response()->json([
            'data' => [
                'upload_session_id' => $session->id,
                'received_chunks' => $receivedChunks,
                'received_count' => count($receivedChunks),
                'total_chunks' => $session->total_chunks,
            ],
        ]);
    }

    public function complete(Request $request, MobileAttachmentUploadSession $session): JsonResponse
    {
        if (! $request->user()->can('mobile.sync')) {
            abort(403);
        }

        $this->assertOrganization($session->organization_id, $request);
        $organization = $this->currentOrganization($request);
        if ($session->user_id !== $request->user()->id) {
            abort(403);
        }

        $request->validate([
            'client_uuid' => ['nullable', 'uuid'],
        ]);

        $session->refresh();
        if ($session->status === 'completed' && $session->assembled_path) {
            $attachment = SnagAttachment::query()
                ->where('snag_id', $session->snag_id)
                ->where('file_path', $session->assembled_path)
                ->first();

            return response()->json([
                'data' => $attachment,
            ]);
        }

        $received = collect($session->received_chunks ?? [])->map(fn ($value) => (int) $value)->sort()->values();
        $expected = collect(range(0, max(0, $session->total_chunks - 1)));

        if ($received->values()->all() !== $expected->values()->all()) {
            throw ValidationException::withMessages([
                'received_chunks' => ['Not all chunks were uploaded.'],
            ]);
        }

        try {
            $localDisk = Storage::disk('local');
            $absoluteTempDir = $localDisk->path($session->temp_dir);
            $absoluteMerged = $absoluteTempDir.DIRECTORY_SEPARATOR.'merged_payload.bin';

            $writeHandle = fopen($absoluteMerged, 'wb');
            if ($writeHandle === false) {
                throw ValidationException::withMessages([
                    'upload' => ['Unable to initialize merged upload file.'],
                ]);
            }

            foreach ($expected as $chunkIndex) {
                $absoluteChunk = $localDisk->path(sprintf('%s/chunk_%05d.part', $session->temp_dir, $chunkIndex));
                $chunkData = file_get_contents($absoluteChunk);
                if ($chunkData === false) {
                    fclose($writeHandle);
                    throw ValidationException::withMessages([
                        'upload' => ['Chunk payload is missing or unreadable.'],
                    ]);
                }

                fwrite($writeHandle, $chunkData);
            }

            fclose($writeHandle);

            $safe = $this->uploadSecurityService->assertSafeFilePath($absoluteMerged, [
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf',
                'video/mp4',
                'video/quicktime',
                'video/x-msvideo',
                'application/json',
                'text/plain',
            ], 52428800);
            $compliance = $this->attachmentComplianceService->evaluate(
                $organization,
                $absoluteMerged,
                $safe['mime_type'],
                $session->pii_redacted,
                'mobile_chunked_upload',
                ['upload_session_id' => $session->id, 'snag_id' => $session->snag_id, 'file_name' => $session->file_name],
            );
            $this->usageLimitService->assertCanConsumeStorage($organization, (int) $safe['file_size']);

            $extension = pathinfo($session->file_name, PATHINFO_EXTENSION);
            $extension = $extension !== '' ? strtolower($extension) : $this->defaultExtensionForMime($safe['mime_type']);

            $finalPath = sprintf(
                'snags/org_%d/snag_%d/chunked_%s.%s',
                $session->organization_id,
                $session->snag_id,
                Str::uuid()->toString(),
                $extension
            );

            Storage::disk('public')->put($finalPath, file_get_contents($absoluteMerged));

            $attachmentType = str_starts_with($safe['mime_type'], 'video/')
                ? 'video'
                : (in_array($safe['mime_type'], ['application/json', 'text/plain'], true) ? 'markup' : 'photo');

            $markupData = null;
            if ($attachmentType === 'markup') {
                $rawMarkup = file_get_contents($absoluteMerged);
                if (! is_string($rawMarkup) || trim($rawMarkup) === '') {
                    throw ValidationException::withMessages([
                        'file' => ['Markup payload is empty.'],
                    ]);
                }

                $decoded = json_decode($rawMarkup, true);
                if (! is_array($decoded)) {
                    throw ValidationException::withMessages([
                        'file' => ['Markup payload must be valid JSON.'],
                    ]);
                }

                $markupData = $decoded;
            }

            $attachment = SnagAttachment::query()->create([
                'snag_id' => $session->snag_id,
                'organization_id' => $session->organization_id,
                'uploaded_by' => $session->user_id,
                'type' => $attachmentType,
                'client_uuid' => $request->input('client_uuid'),
                'file_name' => $session->file_name,
                'file_path' => $finalPath,
                'mime_type' => $safe['mime_type'],
                'file_size' => $safe['file_size'],
                'markup_data' => $markupData,
                'metadata' => [
                    'chunked' => true,
                    'upload_uuid' => $session->upload_uuid,
                    'security' => $compliance,
                ],
            ]);

            $session->assembled_path = $finalPath;
            $session->status = 'completed';
            $session->security_meta = $compliance;
            $session->save();

            Storage::disk('local')->deleteDirectory($session->temp_dir);

            return response()->json([
                'data' => $attachment,
            ], 201);
        } catch (\Throwable $exception) {
            $session->status = 'failed';
            $session->save();

            $this->opsHealthService->recordStorageFailure(
                $session->organization_id,
                'mobile_chunked_upload',
                $exception->getMessage(),
                ['upload_session_id' => $session->id, 'snag_id' => $session->snag_id]
            );

            throw $exception;
        }
    }

    private function defaultExtensionForMime(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
            'video/mp4' => 'mp4',
            'video/quicktime' => 'mov',
            'video/x-msvideo' => 'avi',
            'application/json' => 'json',
            'text/plain' => 'txt',
            default => 'bin',
        };
    }
}
