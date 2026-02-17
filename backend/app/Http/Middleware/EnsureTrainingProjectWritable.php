<?php

namespace App\Http\Middleware;

use App\Models\Project;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTrainingProjectWritable
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if (! $this->shouldGuardPath($request)) {
            return $next($request);
        }

        $projectId = $this->resolveProjectId($request);
        if (! $projectId) {
            return $next($request);
        }

        $project = Project::query()->find($projectId);
        if (! $project) {
            return $next($request);
        }

        if (! $project->is_training || ! $project->training_locked) {
            return $next($request);
        }

        abort(423, 'Training project is read-only. Switch to a live project to apply changes.');
    }

    private function resolveProjectId(Request $request): ?int
    {
        if ($request->filled('project_id')) {
            $inputProjectId = $request->integer('project_id');
            if ($inputProjectId > 0) {
                return $inputProjectId;
            }
        }

        foreach ($request->route()?->parameters() ?? [] as $routeValue) {
            if ($routeValue instanceof Project) {
                return $routeValue->id;
            }

            if (is_object($routeValue) && isset($routeValue->project_id) && $routeValue->project_id) {
                return (int) $routeValue->project_id;
            }
        }

        return null;
    }

    private function shouldGuardPath(Request $request): bool
    {
        $path = trim($request->path(), '/');

        return str_starts_with($path, 'api/snags')
            || str_starts_with($path, 'api/drawings')
            || str_starts_with($path, 'api/closeout')
            || str_starts_with($path, 'api/equipment')
            || str_starts_with($path, 'api/automation')
            || str_starts_with($path, 'api/inspections/templates')
            || str_starts_with($path, 'api/inspections/submissions')
            || str_starts_with($path, 'api/inspections/requests')
            || str_starts_with($path, 'api/inspections/recurring-schedules');
    }
}
