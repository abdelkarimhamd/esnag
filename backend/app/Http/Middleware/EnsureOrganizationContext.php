<?php

namespace App\Http\Middleware;

use App\Support\CurrentOrganization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

use function getPermissionsTeamId;
use function setPermissionsTeamId;

class EnsureOrganizationContext
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication required.');
        }

        $organizationId = $request->header('X-Organization-Id')
            ?? $request->integer('organization_id')
            ?? null;

        $organizationQuery = $user->organizations()->wherePivot('is_active', true);

        $organization = $organizationId
            ? $organizationQuery->where('organizations.id', $organizationId)->first()
            : $organizationQuery->orderBy('organizations.id')->first();

        if (! $organization) {
            abort(403, 'No accessible organization in request context.');
        }

        $previousTeamId = getPermissionsTeamId();
        setPermissionsTeamId($organization->id);

        $request->attributes->set('organization', $organization);
        $request->attributes->set('organization_id', $organization->id);
        app()->instance(CurrentOrganization::class, new CurrentOrganization($organization));

        try {
            return $next($request);
        } finally {
            setPermissionsTeamId($previousTeamId);
        }
    }
}

