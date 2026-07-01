<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Organization;
use Illuminate\Http\Request;

trait InteractsWithOrganizationContext
{
    protected function currentOrganization(Request $request): Organization
    {
        /** @var Organization|null $organization */
        $organization = $request->attributes->get('organization');

        if (! $organization) {
            abort(400, 'Organization context is missing.');
        }

        return $organization;
    }

    protected function assertOrganization(int $organizationId, Request $request): void
    {
        $current = $this->currentOrganization($request);

        if ($current->id !== $organizationId) {
            abort(404);
        }
    }

    /**
     * @param  array<int, string>  $requiredPermissions
     */
    protected function denyWithPermissions(Request $request, array $requiredPermissions, string $message = 'Forbidden'): never
    {
        $request->attributes->set('required_permissions', array_values(array_unique(array_map('strval', $requiredPermissions))));
        abort(403, $message);
    }
}

