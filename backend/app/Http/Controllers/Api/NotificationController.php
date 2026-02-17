<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    use InteractsWithOrganizationContext;

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()->can('notifications.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $perPage = min(100, max(5, $request->integer('per_page', 20)));

        $jsonOrganizationNeedle = sprintf('"organization_id":%d', $organization->id);

        $notifications = $request->user()
            ->notifications()
            ->where('data', 'like', "%{$jsonOrganizationNeedle}%")
            ->latest()
            ->paginate($perPage);

        return response()->json([
            'data' => $notifications->items(),
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
                'unread_count' => $request->user()->unreadNotifications()
                    ->where('data', 'like', "%{$jsonOrganizationNeedle}%")
                    ->count(),
            ],
        ]);
    }

    public function markRead(Request $request, string $notificationId): JsonResponse
    {
        if (! $request->user()->can('notifications.view')) {
            abort(403);
        }

        $notification = $request->user()->notifications()->whereKey($notificationId)->firstOrFail();
        $notification->markAsRead();

        return response()->json([
            'message' => 'Notification marked as read.',
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        if (! $request->user()->can('notifications.view')) {
            abort(403);
        }

        $organization = $this->currentOrganization($request);
        $jsonOrganizationNeedle = sprintf('"organization_id":%d', $organization->id);

        $request->user()->unreadNotifications()
            ->where('data', 'like', "%{$jsonOrganizationNeedle}%")
            ->get()
            ->each->markAsRead();

        return response()->json([
            'message' => 'All notifications marked as read.',
        ]);
    }
}

