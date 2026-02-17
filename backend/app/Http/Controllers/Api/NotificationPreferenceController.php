<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    use InteractsWithOrganizationContext;

    public function show(Request $request): JsonResponse
    {
        if (! $request->user()->can('notification.preferences.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $preference = NotificationPreference::query()->firstOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $request->user()->id,
            ],
            [
                'digest_frequency' => 'daily',
                'email_enabled' => true,
                'in_app_enabled' => true,
                'push_enabled' => false,
                'timezone' => 'UTC',
            ]
        );

        return response()->json([
            'data' => $preference,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! $request->user()->can('notification.preferences.manage')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);

        $validated = $request->validate([
            'digest_frequency' => ['sometimes', 'required', 'in:off,daily,weekly,monthly'],
            'email_enabled' => ['sometimes', 'boolean'],
            'in_app_enabled' => ['sometimes', 'boolean'],
            'push_enabled' => ['sometimes', 'boolean'],
            'immediate_assignment' => ['sometimes', 'boolean'],
            'immediate_status_change' => ['sometimes', 'boolean'],
            'immediate_comment' => ['sometimes', 'boolean'],
            'immediate_mention' => ['sometimes', 'boolean'],
            'immediate_escalation' => ['sometimes', 'boolean'],
            'approval_needed' => ['sometimes', 'boolean'],
            'signature_requested' => ['sometimes', 'boolean'],
            'quiet_hours_start' => ['nullable', 'date_format:H:i'],
            'quiet_hours_end' => ['nullable', 'date_format:H:i'],
            'timezone' => ['sometimes', 'required', 'string', 'max:80'],
        ]);

        $preference = NotificationPreference::query()->firstOrCreate(
            [
                'organization_id' => $organization->id,
                'user_id' => $request->user()->id,
            ],
            [
                'digest_frequency' => 'daily',
                'email_enabled' => true,
                'in_app_enabled' => true,
                'push_enabled' => false,
                'timezone' => 'UTC',
            ]
        );

        $preference->fill($validated);
        $preference->save();

        return response()->json([
            'data' => $preference,
        ]);
    }
}
