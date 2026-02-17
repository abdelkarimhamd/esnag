<?php

namespace App\Http\Middleware;

use App\Models\Project;
use App\Services\FeatureFlagService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureFeatureEnabled
{
    public function __construct(
        private readonly FeatureFlagService $featureFlagService,
    ) {
    }

    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string $featureKey): Response
    {
        $organization = $request->attributes->get('organization');
        if (! $organization) {
            return $next($request);
        }

        $projectId = $this->resolveProjectId($request);
        if (! $this->featureFlagService->isEnabled($organization->id, $projectId, $featureKey)) {
            abort(403, sprintf('Feature "%s" is disabled for this scope.', $featureKey));
        }

        return $next($request);
    }

    private function resolveProjectId(Request $request): ?int
    {
        if ($request->filled('project_id')) {
            $value = $request->integer('project_id');
            if ($value > 0) {
                return $value;
            }
        }

        foreach ([
            'project',
            'drawing',
            'snag',
            'closeoutTemplate',
            'workflowAutomationRule',
            'snagReminderPolicy',
            'equipment',
            'inspectionTemplate',
            'inspectionSubmission',
            'inspectionRequest',
            'inspectionRecurringSchedule',
            'exportJob',
            'dashboardConfig',
            'team',
        ] as $routeKey) {
            $routeValue = $request->route($routeKey);
            if (! $routeValue) {
                continue;
            }

            if ($routeValue instanceof Project) {
                return $routeValue->id;
            }

            if (is_object($routeValue) && isset($routeValue->project_id) && $routeValue->project_id) {
                return (int) $routeValue->project_id;
            }

            if ($routeKey === 'project' && is_numeric($routeValue)) {
                return (int) $routeValue;
            }
        }

        return null;
    }
}

