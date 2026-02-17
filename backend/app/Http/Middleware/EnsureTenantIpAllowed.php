<?php

namespace App\Http\Middleware;

use App\Services\OrganizationSecurityService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantIpAllowed
{
    public function __construct(
        private readonly OrganizationSecurityService $organizationSecurityService,
    ) {
    }

    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $organization = $request->attributes->get('organization');
        if (! $organization) {
            return $next($request);
        }

        $settings = $this->organizationSecurityService->resolvedSettings($organization->id);
        if (! ($settings['enforce_ip_allowlist'] ?? false)) {
            return $next($request);
        }

        $allowlist = collect($settings['ip_allowlist'] ?? [])
            ->map(fn ($value) => trim((string) $value))
            ->filter(fn (string $value) => $value !== '')
            ->values()
            ->all();

        if ($allowlist === []) {
            abort(403, 'Request IP is not allowlisted for this organization.');
        }

        $requestIp = (string) ($request->ip() ?? '');
        if ($requestIp === '' || ! $this->isIpAllowed($requestIp, $allowlist)) {
            abort(403, 'Request IP is not allowlisted for this organization.');
        }

        return $next($request);
    }

    /**
     * @param  array<int, string>  $allowlist
     */
    private function isIpAllowed(string $ip, array $allowlist): bool
    {
        foreach ($allowlist as $entry) {
            if ($this->ipMatchesRule($ip, $entry)) {
                return true;
            }
        }

        return false;
    }

    private function ipMatchesRule(string $ip, string $rule): bool
    {
        if (! str_contains($rule, '/')) {
            return $ip === $rule;
        }

        [$subnet, $maskBitsRaw] = explode('/', $rule, 2);
        $maskBits = (int) $maskBitsRaw;

        $ipBytes = @inet_pton($ip);
        $subnetBytes = @inet_pton($subnet);
        if ($ipBytes === false || $subnetBytes === false || strlen($ipBytes) !== strlen($subnetBytes)) {
            return false;
        }

        $maxBits = strlen($ipBytes) * 8;
        if ($maskBits < 0 || $maskBits > $maxBits) {
            return false;
        }

        $fullBytes = intdiv($maskBits, 8);
        $remainingBits = $maskBits % 8;

        if ($fullBytes > 0 && substr($ipBytes, 0, $fullBytes) !== substr($subnetBytes, 0, $fullBytes)) {
            return false;
        }

        if ($remainingBits === 0) {
            return true;
        }

        $mask = (0xFF << (8 - $remainingBits)) & 0xFF;
        $ipByte = ord($ipBytes[$fullBytes]);
        $subnetByte = ord($subnetBytes[$fullBytes]);

        return ($ipByte & $mask) === ($subnetByte & $mask);
    }
}

