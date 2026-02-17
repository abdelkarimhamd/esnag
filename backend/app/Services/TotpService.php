<?php

namespace App\Services;

use Illuminate\Support\Str;

class TotpService
{
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function generateSecret(int $length = 32): string
    {
        $length = max(16, min(64, $length));
        $secret = '';
        $alphabetLength = strlen(self::BASE32_ALPHABET);

        for ($index = 0; $index < $length; $index++) {
            $secret .= self::BASE32_ALPHABET[random_int(0, $alphabetLength - 1)];
        }

        return $secret;
    }

    public function provisioningUri(string $issuer, string $accountName, string $secret): string
    {
        $label = rawurlencode($issuer.':'.$accountName);

        return sprintf(
            'otpauth://totp/%s?secret=%s&issuer=%s&period=30&digits=6',
            $label,
            rawurlencode($secret),
            rawurlencode($issuer),
        );
    }

    public function verify(string $secret, string $code, int $window = 1, int $period = 30, int $digits = 6): bool
    {
        $normalizedCode = preg_replace('/\D+/', '', $code ?? '');
        if (! is_string($normalizedCode) || strlen($normalizedCode) !== $digits) {
            return false;
        }

        $binarySecret = $this->base32Decode($secret);
        if ($binarySecret === null || $binarySecret === '') {
            return false;
        }

        $counter = (int) floor(time() / max(1, $period));

        for ($offset = -$window; $offset <= $window; $offset++) {
            $candidate = $this->hotp($binarySecret, $counter + $offset, $digits);
            if (hash_equals($candidate, $normalizedCode)) {
                return true;
            }
        }

        return false;
    }

    private function hotp(string $binarySecret, int $counter, int $digits): string
    {
        $high = (int) floor($counter / 4294967296);
        $low = $counter % 4294967296;
        $binaryCounter = pack('N2', $high, $low);
        $hash = hash_hmac('sha1', $binaryCounter, $binarySecret, true);
        $offset = ord(substr($hash, -1)) & 0x0F;
        $segment = substr($hash, $offset, 4);
        $value = unpack('N', $segment)[1] & 0x7FFFFFFF;
        $otp = $value % (10 ** $digits);

        return str_pad((string) $otp, $digits, '0', STR_PAD_LEFT);
    }

    private function base32Decode(string $input): ?string
    {
        $clean = strtoupper(Str::of($input)->replace('=', '')->replace(' ', '')->toString());
        if ($clean === '' || preg_match('/[^A-Z2-7]/', $clean)) {
            return null;
        }

        $bits = '';
        foreach (str_split($clean) as $char) {
            $index = strpos(self::BASE32_ALPHABET, $char);
            if ($index === false) {
                return null;
            }

            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }

        $binary = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) < 8) {
                continue;
            }

            $binary .= chr(bindec($chunk));
        }

        return $binary;
    }
}

