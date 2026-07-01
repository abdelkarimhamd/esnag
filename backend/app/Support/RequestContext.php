<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RequestContext
{
    public const REQUEST_ID_ATTRIBUTE = 'request_id';

    public static function resolveRequestId(Request $request): string
    {
        $existing = trim((string) $request->headers->get('X-Request-Id', ''));
        if ($existing !== '') {
            return $existing;
        }

        return (string) Str::uuid();
    }

    public static function getRequestId(?Request $request = null): ?string
    {
        $request ??= request();
        if (! $request instanceof Request) {
            return null;
        }

        $fromAttribute = $request->attributes->get(self::REQUEST_ID_ATTRIBUTE);
        if (is_string($fromAttribute) && $fromAttribute !== '') {
            return $fromAttribute;
        }

        $fromHeader = $request->headers->get('X-Request-Id');
        if (is_string($fromHeader) && trim($fromHeader) !== '') {
            return trim($fromHeader);
        }

        return null;
    }
}

