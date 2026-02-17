<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\ValidationException;

class UploadSecurityService
{
    /**
     * @param  array<int, string>  $allowedMimes
     * @return array{mime_type: string, file_size: int}
     */
    public function assertSafeUploadedFile(UploadedFile $file, array $allowedMimes, int $maxBytes = 52428800): array
    {
        $path = $file->getRealPath();
        if (! $path) {
            throw ValidationException::withMessages([
                'file' => ['Uploaded file path is invalid.'],
            ]);
        }

        return $this->assertSafeFilePath($path, $allowedMimes, $maxBytes);
    }

    /**
     * @param  array<int, string>  $allowedMimes
     * @return array{mime_type: string, file_size: int}
     */
    public function assertSafeFilePath(string $absolutePath, array $allowedMimes, int $maxBytes = 52428800): array
    {
        if (! File::exists($absolutePath)) {
            throw ValidationException::withMessages([
                'file' => ['Uploaded file was not found.'],
            ]);
        }

        $fileSize = (int) File::size($absolutePath);
        if ($fileSize <= 0) {
            throw ValidationException::withMessages([
                'file' => ['File is empty.'],
            ]);
        }

        if ($fileSize > $maxBytes) {
            throw ValidationException::withMessages([
                'file' => ['File size exceeds allowed upload limits.'],
            ]);
        }

        $detectedMime = (string) (finfo_file(finfo_open(FILEINFO_MIME_TYPE), $absolutePath) ?: 'application/octet-stream');

        $blockedMimes = [
            'application/x-msdownload',
            'application/x-dosexec',
            'application/x-sh',
            'application/x-php',
            'text/x-php',
        ];

        if (in_array($detectedMime, $blockedMimes, true)) {
            throw ValidationException::withMessages([
                'file' => ['Executable uploads are not allowed.'],
            ]);
        }

        if (! in_array($detectedMime, $allowedMimes, true)) {
            throw ValidationException::withMessages([
                'file' => ['Detected file type is not allowed.'],
            ]);
        }

        if (str_starts_with($detectedMime, 'image/')) {
            if (@getimagesize($absolutePath) === false) {
                throw ValidationException::withMessages([
                    'file' => ['Image payload is invalid or corrupted.'],
                ]);
            }
        }

        if ($detectedMime === 'application/pdf') {
            $header = File::get($absolutePath, true);
            if (! is_string($header) || ! str_starts_with($header, '%PDF')) {
                throw ValidationException::withMessages([
                    'file' => ['Invalid PDF signature.'],
                ]);
            }
        }

        return [
            'mime_type' => $detectedMime,
            'file_size' => $fileSize,
        ];
    }
}

