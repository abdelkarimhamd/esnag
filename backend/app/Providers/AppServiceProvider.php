<?php

namespace App\Providers;

use App\Models\Area;
use App\Models\Building;
use App\Models\CloseoutTemplate;
use App\Models\Drawing;
use App\Models\Equipment;
use App\Models\Floor;
use App\Models\HandoverWorkflow;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Location;
use App\Models\Project;
use App\Models\Snag;
use App\Models\SnagCategory;
use App\Observers\AuditableModelObserver;
use App\Policies\CloseoutTemplatePolicy;
use App\Policies\DrawingPolicy;
use App\Policies\EquipmentPolicy;
use App\Policies\InspectionRequestPolicy;
use App\Policies\InspectionSubmissionPolicy;
use App\Policies\InspectionTemplatePolicy;
use App\Policies\ProjectPolicy;
use App\Policies\SnagPolicy;
use Illuminate\Auth\Events\Authenticated;
use Illuminate\Support\Facades\Gate;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Snag::class, SnagPolicy::class);
        Gate::policy(Drawing::class, DrawingPolicy::class);
        Gate::policy(Project::class, ProjectPolicy::class);
        Gate::policy(CloseoutTemplate::class, CloseoutTemplatePolicy::class);
        Gate::policy(InspectionTemplate::class, InspectionTemplatePolicy::class);
        Gate::policy(InspectionSubmission::class, InspectionSubmissionPolicy::class);
        Gate::policy(InspectionRequest::class, InspectionRequestPolicy::class);
        Gate::policy(Equipment::class, EquipmentPolicy::class);

        // Unified audit stream (item 9 / BR-BR-013): capture every master-data and
        // workflow-config mutation regardless of the controller that made it.
        foreach ([Area::class, Building::class, Floor::class, Location::class, SnagCategory::class, HandoverWorkflow::class] as $auditable) {
            $auditable::observe(AuditableModelObserver::class);
        }

        // Enrich the shared log context with the authenticated user id as soon as a
        // guard resolves the user (after the api-group middleware runs), so logs
        // emitted by controllers/services carry user correlation. See AttachRequestContext.
        Event::listen(Authenticated::class, function (Authenticated $event): void {
            Log::withContext(['user_id' => $event->user->getAuthIdentifier()]);
        });

        RateLimiter::for('api', function (Request $request): Limit {
            $key = $request->user()?->id ? 'user:'.$request->user()->id : 'ip:'.$request->ip();

            return Limit::perMinute(120)->by($key);
        });

        RateLimiter::for('sync', function (Request $request): Limit {
            $key = $request->user()?->id ? 'sync:'.$request->user()->id : 'sync-ip:'.$request->ip();

            return Limit::perMinute(25)->by($key);
        });

        RateLimiter::for('uploads', function (Request $request): array {
            $key = $request->user()?->id ? 'upload:'.$request->user()->id : 'upload-ip:'.$request->ip();

            return [
                Limit::perMinute(30)->by($key),
                Limit::perHour(240)->by($key),
            ];
        });
    }
}

