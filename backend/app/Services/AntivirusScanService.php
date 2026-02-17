<?php

namespace App\Services;

use Illuminate\Support\Facades\File;

class AntivirusScanService
{
    private const EICAR_SIGNATURE = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

    /**
     * @return array{
     *   status: 'clean'|'infected'|'error',
     *   engine: string,
     *   signature: string|null,
     *   message: string|null
     * }
     */
    public function scanFile(string $absolutePath): array
    {
        if (! File::exists($absolutePath)) {
            return [
                'status' => 'error',
                'engine' => 'none',
                'signature' => null,
                'message' => 'File for antivirus scan was not found.',
            ];
        }

        $driver = strtolower((string) config('security.antivirus_driver', 'eicar'));

        if ($driver === 'clamav') {
            return $this->scanWithClamavBinary($absolutePath);
        }

        return $this->scanWithEicarHeuristic($absolutePath);
    }

    /**
     * @return array{
     *   status: 'clean'|'infected'|'error',
     *   engine: string,
     *   signature: string|null,
     *   message: string|null
     * }
     */
    private function scanWithEicarHeuristic(string $absolutePath): array
    {
        $contents = @file_get_contents($absolutePath);
        if (! is_string($contents)) {
            return [
                'status' => 'error',
                'engine' => 'eicar',
                'signature' => null,
                'message' => 'Unable to read file for antivirus heuristic scan.',
            ];
        }

        if (str_contains($contents, self::EICAR_SIGNATURE)) {
            return [
                'status' => 'infected',
                'engine' => 'eicar',
                'signature' => 'EICAR-Test-File',
                'message' => 'EICAR signature detected.',
            ];
        }

        return [
            'status' => 'clean',
            'engine' => 'eicar',
            'signature' => null,
            'message' => null,
        ];
    }

    /**
     * @return array{
     *   status: 'clean'|'infected'|'error',
     *   engine: string,
     *   signature: string|null,
     *   message: string|null
     * }
     */
    private function scanWithClamavBinary(string $absolutePath): array
    {
        $binary = (string) config('security.clamav_binary', 'clamscan');
        $command = escapeshellcmd($binary).' --no-summary '.escapeshellarg($absolutePath).' 2>&1';

        $output = [];
        $exitCode = 0;
        @exec($command, $output, $exitCode);

        $message = trim(implode("\n", $output));
        if ($exitCode === 0) {
            return [
                'status' => 'clean',
                'engine' => 'clamav',
                'signature' => null,
                'message' => null,
            ];
        }

        if ($exitCode === 1) {
            $signature = null;
            foreach ($output as $line) {
                if (str_contains((string) $line, 'FOUND')) {
                    $signature = trim(str_replace('FOUND', '', (string) $line));
                    break;
                }
            }

            return [
                'status' => 'infected',
                'engine' => 'clamav',
                'signature' => $signature ?: 'malware-detected',
                'message' => $message !== '' ? $message : 'Malware signature detected by ClamAV.',
            ];
        }

        return [
            'status' => 'error',
            'engine' => 'clamav',
            'signature' => null,
            'message' => $message !== '' ? $message : 'ClamAV scan process failed.',
        ];
    }
}

