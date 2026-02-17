<?php

namespace App\Providers;

use App\Models\CloseoutTemplate;
use App\Models\Drawing;
use App\Models\Equipment;
use App\Models\InspectionRequest;
use App\Models\InspectionSubmission;
use App\Models\InspectionTemplate;
use App\Models\Project;
use App\Models\Snag;
use App\Policies\CloseoutTemplatePolicy;
use App\Policies\DrawingPolicy;
use App\Policies\EquipmentPolicy;
use App\Policies\InspectionRequestPolicy;
use App\Policies\InspectionSubmissionPolicy;
use App\Policies\InspectionTemplatePolicy;
use App\Policies\ProjectPolicy;
use App\Policies\SnagPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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

