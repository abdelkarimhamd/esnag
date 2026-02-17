<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('organization.{organizationId}', function (User $user, int $organizationId): bool {
    return $user->organizations()
        ->where('organizations.id', $organizationId)
        ->wherePivot('is_active', true)
        ->exists();
});

