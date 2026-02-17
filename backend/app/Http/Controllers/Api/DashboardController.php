<?php

namespace App\Http\Controllers\Api;

use App\Enums\SnagStatus;
use App\Http\Controllers\Api\Concerns\InteractsWithOrganizationContext;
use App\Http\Controllers\Controller;
use App\Models\Snag;
use App\Models\SnagStatusHistory;
use App\Services\AccessControlService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    use InteractsWithOrganizationContext;

    public function __construct(
        private readonly AccessControlService $accessControlService,
    ) {
    }

    public function kpis(Request $request): JsonResponse
    {
        $this->authorizeDashboard($request);
        $organization = $this->currentOrganization($request);
        $queryHash = md5(json_encode($this->normalizedDashboardQuery($request), JSON_THROW_ON_ERROR));
        $cacheKey = sprintf('dashboard:kpis:org:%d:user:%d:hash:%s', $organization->id, $request->user()->id, $queryHash);

        $payload = Cache::remember($cacheKey, now()->addSeconds(45), function () use ($request): array {
            $baseQuery = $this->baseSnagsQuery($request);

            /** @var Collection<int, Snag> $snags */
            $snags = (clone $baseQuery)
                ->with([
                    'closeoutInstance.template:id,trade',
                    'assignee:id,name,email',
                    'assignedCompany:id,name,code,type',
                    'assignedTeam:id,name,code,project_id,company_id',
                    'rootCauseCategory:id,name,code',
                ])
                ->get();

            $total = $snags->count();
            $openSnags = $snags->filter(fn (Snag $snag) => ! in_array($snag->status, [SnagStatus::Closed->value, SnagStatus::Rejected->value], true));
            $closedSnags = $snags->filter(fn (Snag $snag) => ! empty($snag->closed_at));
            $overdue = $openSnags
                ->filter(fn (Snag $snag) => $snag->due_date !== null && Carbon::parse($snag->due_date)->lt(Carbon::today()))
                ->count();

            $avgClosureDays = $closedSnags->isEmpty()
                ? null
                : round($closedSnags
                    ->map(fn (Snag $snag) => $snag->created_at->diffInHours($snag->closed_at) / 24)
                    ->average(), 2);

            $statusBreakdown = collect(SnagStatus::labels())
                ->mapWithKeys(fn (string $label, string $status) => [$status => $snags->where('status', $status)->count()]);

            $byTrade = $snags
                ->map(fn (Snag $snag) => $snag->closeoutInstance?->template?->trade ?: 'Unspecified')
                ->countBy()
                ->map(fn (int $count, string $trade) => ['trade' => $trade, 'total' => $count])
                ->sortByDesc('total')
                ->values();

            $byAssignee = $snags
                ->groupBy(fn (Snag $snag) => $snag->assigned_to ?: 'unassigned')
                ->map(function (Collection $items): array {
                    /** @var Snag|null $first */
                    $first = $items->first();
                    $assignee = $first?->assignee;
                    $openCount = $items
                        ->filter(fn (Snag $snag) => ! in_array($snag->status, [SnagStatus::Closed->value, SnagStatus::Rejected->value], true))
                        ->count();

                    return [
                        'assignee_id' => $assignee?->id,
                        'assignee_name' => $assignee?->name ?? 'Unassigned',
                        'total' => $items->count(),
                        'open' => $openCount,
                    ];
                })
                ->sortByDesc('total')
                ->values();

            $historyRows = SnagStatusHistory::query()
                ->whereIn('snag_id', $snags->pluck('id')->all())
                ->whereIn('to_status', [
                    SnagStatus::Assigned->value,
                    SnagStatus::InProgress->value,
                    SnagStatus::ReadyForReview->value,
                    SnagStatus::Rejected->value,
                ])
                ->orderBy('created_at')
                ->get(['snag_id', 'to_status', 'created_at']);

            $firstAssigned = $historyRows
                ->where('to_status', SnagStatus::Assigned->value)
                ->groupBy('snag_id')
                ->map(fn (Collection $items) => Carbon::parse($items->first()->created_at));
            $firstInProgress = $historyRows
                ->where('to_status', SnagStatus::InProgress->value)
                ->groupBy('snag_id')
                ->map(fn (Collection $items) => Carbon::parse($items->first()->created_at));
            $firstReadyForReview = $historyRows
                ->where('to_status', SnagStatus::ReadyForReview->value)
                ->groupBy('snag_id')
                ->map(fn (Collection $items) => Carbon::parse($items->first()->created_at));
            $firstRejected = $historyRows
                ->where('to_status', SnagStatus::Rejected->value)
                ->groupBy('snag_id')
                ->map(fn (Collection $items) => Carbon::parse($items->first()->created_at));

            $ackSlaHours = max(1, $request->integer('ack_sla_hours', 24));
            $fixSlaHours = max(1, $request->integer('fix_sla_hours', 72));
            $closeSlaHours = max(1, $request->integer('close_sla_hours', 168));

            $ackHours = collect();
            $fixHours = collect();
            $closeHours = collect();

            foreach ($snags as $snag) {
                $ackAt = $snag->acknowledged_at
                    ? Carbon::parse($snag->acknowledged_at)
                    : ($firstAssigned->get($snag->id)
                        ?? $firstInProgress->get($snag->id)
                        ?? $firstReadyForReview->get($snag->id)
                        ?? null);

                if ($ackAt) {
                    $ackHours->push(round($snag->created_at->diffInMinutes($ackAt) / 60, 2));
                }

                $startedAt = $snag->started_at
                    ? Carbon::parse($snag->started_at)
                    : $firstInProgress->get($snag->id);
                $fixEndedAt = $snag->ready_for_review_at
                    ? Carbon::parse($snag->ready_for_review_at)
                    : ($firstReadyForReview->get($snag->id) ?? ($snag->closed_at ? Carbon::parse($snag->closed_at) : null));

                if ($startedAt && $fixEndedAt && $fixEndedAt->gte($startedAt)) {
                    $fixHours->push(round($startedAt->diffInMinutes($fixEndedAt) / 60, 2));
                }

                if ($snag->closed_at) {
                    $closeHours->push(round($snag->created_at->diffInMinutes(Carbon::parse($snag->closed_at)) / 60, 2));
                }
            }

            $sla = [
                'thresholds' => [
                    'ack_hours' => $ackSlaHours,
                    'fix_hours' => $fixSlaHours,
                    'close_hours' => $closeSlaHours,
                ],
                'averages' => [
                    'ack_hours' => $ackHours->isNotEmpty() ? round($ackHours->avg(), 2) : null,
                    'fix_hours' => $fixHours->isNotEmpty() ? round($fixHours->avg(), 2) : null,
                    'close_hours' => $closeHours->isNotEmpty() ? round($closeHours->avg(), 2) : null,
                ],
                'compliance' => [
                    'ack_measured' => $ackHours->count(),
                    'fix_measured' => $fixHours->count(),
                    'close_measured' => $closeHours->count(),
                    'ack_within_sla' => $ackHours->filter(fn ($hours) => $hours <= $ackSlaHours)->count(),
                    'fix_within_sla' => $fixHours->filter(fn ($hours) => $hours <= $fixSlaHours)->count(),
                    'close_within_sla' => $closeHours->filter(fn ($hours) => $hours <= $closeSlaHours)->count(),
                ],
            ];

            $sla['compliance']['ack_rate'] = $sla['compliance']['ack_measured'] > 0
                ? round(($sla['compliance']['ack_within_sla'] / $sla['compliance']['ack_measured']) * 100, 2)
                : null;
            $sla['compliance']['fix_rate'] = $sla['compliance']['fix_measured'] > 0
                ? round(($sla['compliance']['fix_within_sla'] / $sla['compliance']['fix_measured']) * 100, 2)
                : null;
            $sla['compliance']['close_rate'] = $sla['compliance']['close_measured'] > 0
                ? round(($sla['compliance']['close_within_sla'] / $sla['compliance']['close_measured']) * 100, 2)
                : null;

            $rootCauseBuckets = $snags
                ->map(fn (Snag $snag) => $snag->rootCauseCategory?->name ?: 'Unclassified')
                ->countBy()
                ->sortDesc();
            $rootCauseTotal = max(1, $rootCauseBuckets->sum());
            $running = 0;
            $rootCausePareto = $rootCauseBuckets
                ->map(function (int $count, string $category) use (&$running, $rootCauseTotal): array {
                    $running += $count;

                    return [
                        'category' => $category,
                        'count' => $count,
                        'percentage' => round(($count / $rootCauseTotal) * 100, 2),
                        'cumulative_percentage' => round(($running / $rootCauseTotal) * 100, 2),
                    ];
                })
                ->values();

            $costSummary = [
                'estimated_cost_total' => round((float) $snags->sum(fn (Snag $snag) => (float) ($snag->estimated_cost ?? 0)), 2),
                'estimated_hours_total' => round((float) $snags->sum(fn (Snag $snag) => (float) ($snag->estimated_hours ?? 0)), 2),
                'estimated_cost_open' => round((float) $openSnags->sum(fn (Snag $snag) => (float) ($snag->estimated_cost ?? 0)), 2),
                'estimated_hours_open' => round((float) $openSnags->sum(fn (Snag $snag) => (float) ($snag->estimated_hours ?? 0)), 2),
            ];

            $costByTrade = $snags
                ->groupBy(fn (Snag $snag) => $snag->closeoutInstance?->template?->trade ?: 'Unspecified')
                ->map(function (Collection $items, string $trade): array {
                    return [
                        'trade' => $trade,
                        'estimated_cost' => round((float) $items->sum(fn (Snag $snag) => (float) ($snag->estimated_cost ?? 0)), 2),
                        'estimated_hours' => round((float) $items->sum(fn (Snag $snag) => (float) ($snag->estimated_hours ?? 0)), 2),
                        'count' => $items->count(),
                    ];
                })
                ->sortByDesc('estimated_cost')
                ->values();

            $costByStakeholder = $snags
                ->groupBy(fn (Snag $snag) => $this->stakeholderLabel($snag))
                ->map(function (Collection $items, string $stakeholder): array {
                    return [
                        'stakeholder' => $stakeholder,
                        'estimated_cost' => round((float) $items->sum(fn (Snag $snag) => (float) ($snag->estimated_cost ?? 0)), 2),
                        'estimated_hours' => round((float) $items->sum(fn (Snag $snag) => (float) ($snag->estimated_hours ?? 0)), 2),
                        'count' => $items->count(),
                    ];
                })
                ->sortByDesc('estimated_cost')
                ->values();

            $forecastHistoryDays = max(7, min(30, $request->integer('forecast_history_days', 14)));
            $forecastProjectionDays = max(7, min(30, $request->integer('forecast_projection_days', 14)));

            $overallForecast = $this->buildForecast($snags, $firstRejected, $forecastHistoryDays, $forecastProjectionDays);

            $tradeForecast = $snags
                ->groupBy(fn (Snag $snag) => $snag->closeoutInstance?->template?->trade ?: 'Unspecified')
                ->map(function (Collection $items, string $trade) use ($firstRejected, $forecastHistoryDays, $forecastProjectionDays): array {
                    $projection = $this->buildForecast($items, $firstRejected, $forecastHistoryDays, $forecastProjectionDays);

                    return [
                        'trade' => $trade,
                        'current_open' => $projection['current_open'],
                        'projected_open_end' => $projection['projected_open_end'],
                        'trend_slope' => $projection['trend_slope'],
                    ];
                })
                ->sortByDesc('current_open')
                ->values();

            $stakeholderForecast = $snags
                ->groupBy(fn (Snag $snag) => $this->stakeholderLabel($snag))
                ->map(function (Collection $items, string $stakeholder) use ($firstRejected, $forecastHistoryDays, $forecastProjectionDays): array {
                    $projection = $this->buildForecast($items, $firstRejected, $forecastHistoryDays, $forecastProjectionDays);

                    return [
                        'stakeholder' => $stakeholder,
                        'current_open' => $projection['current_open'],
                        'projected_open_end' => $projection['projected_open_end'],
                        'trend_slope' => $projection['trend_slope'],
                    ];
                })
                ->sortByDesc('current_open')
                ->values();

            return [
                'summary' => [
                    'total_snags' => $total,
                    'open_snags' => $openSnags->count(),
                    'overdue_snags' => $overdue,
                    'avg_closure_days' => $avgClosureDays,
                ],
                'status_breakdown' => $statusBreakdown,
                'by_trade' => $byTrade,
                'by_assignee' => $byAssignee,
                'sla' => $sla,
                'root_cause_pareto' => $rootCausePareto,
                'cost_impact' => [
                    'summary' => $costSummary,
                    'by_trade' => $costByTrade,
                    'by_stakeholder' => $costByStakeholder,
                ],
                'forecast' => [
                    'overall' => $overallForecast,
                    'by_trade' => $tradeForecast,
                    'by_stakeholder' => $stakeholderForecast,
                ],
            ];
        });

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function charts(Request $request): JsonResponse
    {
        $this->authorizeDashboard($request);
        $organization = $this->currentOrganization($request);
        $queryHash = md5(json_encode($this->normalizedDashboardQuery($request), JSON_THROW_ON_ERROR));
        $cacheKey = sprintf('dashboard:charts:org:%d:user:%d:hash:%s', $organization->id, $request->user()->id, $queryHash);

        $payload = Cache::remember($cacheKey, now()->addSeconds(45), function () use ($request): array {
            $baseQuery = $this->baseSnagsQuery($request);

            $startDate = Carbon::today()->subDays(13);
            $trendSeed = collect(range(0, 13))
                ->mapWithKeys(fn (int $offset) => [Carbon::today()->subDays(13 - $offset)->toDateString() => [
                    'date' => Carbon::today()->subDays(13 - $offset)->toDateString(),
                    'created' => 0,
                    'closed' => 0,
                ]]);

            $createdSeries = (clone $baseQuery)
                ->whereDate('created_at', '>=', $startDate)
                ->get(['created_at'])
                ->groupBy(fn (Snag $snag) => $snag->created_at->toDateString())
                ->map->count();

            $closedSeries = (clone $baseQuery)
                ->whereDate('closed_at', '>=', $startDate)
                ->whereNotNull('closed_at')
                ->get(['closed_at'])
                ->groupBy(fn (Snag $snag) => $snag->closed_at->toDateString())
                ->map->count();

            $trend = $trendSeed
                ->map(function (array $entry, string $date) use ($createdSeries, $closedSeries): array {
                    $entry['created'] = (int) ($createdSeries[$date] ?? 0);
                    $entry['closed'] = (int) ($closedSeries[$date] ?? 0);

                    return $entry;
                })
                ->values();

            $priorityBreakdown = (clone $baseQuery)
                ->get(['priority'])
                ->countBy('priority')
                ->map(fn (int $total, string $priority) => ['priority' => $priority, 'total' => $total])
                ->values();

            return [
                'trend_14_days' => $trend,
                'priority_breakdown' => $priorityBreakdown,
            ];
        });

        return response()->json([
            'data' => $payload,
        ]);
    }

    private function authorizeDashboard(Request $request): void
    {
        $organization = $this->currentOrganization($request);
        $user = $request->user();
        $projectId = $request->integer('project_id') ?: null;

        if ($projectId !== null) {
            if (
                ! $this->accessControlService->allows($user, $organization->id, $projectId, 'dashboard.view')
                || ! $this->accessControlService->allows($user, $organization->id, $projectId, 'snags.view')
            ) {
                abort(403);
            }

            return;
        }

        if (
            $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'dashboard.view')
            && $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'snags.view')
        ) {
            return;
        }

        $dashboardProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'dashboard.view');
        $snagProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'snags.view');
        if (array_values(array_intersect($dashboardProjects, $snagProjects)) === []) {
            abort(403);
        }
    }

    private function baseSnagsQuery(Request $request): Builder
    {
        $organization = $this->currentOrganization($request);
        $user = $request->user();

        $query = Snag::query()->where('organization_id', $organization->id);

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        } elseif (
            ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'dashboard.view')
            || ! $this->accessControlService->allowsWithoutDelegation($user, $organization->id, null, 'snags.view')
        ) {
            $dashboardProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'dashboard.view');
            $snagProjects = $this->accessControlService->projectIdsWithPermission($user, $organization->id, 'snags.view');
            $allowedProjectIds = array_values(array_intersect($dashboardProjects, $snagProjects));
            $query->whereIn('project_id', $allowedProjectIds === [] ? [0] : $allowedProjectIds);
        }

        $statusFilter = $this->requestList($request, 'status');
        if ($statusFilter !== []) {
            $query->whereIn('status', $statusFilter);
        }

        $priorityFilter = $this->requestList($request, 'priority');
        if ($priorityFilter !== []) {
            $query->whereIn('priority', $priorityFilter);
        }

        if ($rootCauseId = $request->integer('root_cause_category_id')) {
            $query->where('root_cause_category_id', $rootCauseId);
        }

        $assigneeFilter = collect($this->requestList($request, 'assigned_to'))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();
        if ($assigneeFilter !== []) {
            $query->whereIn('assigned_to', $assigneeFilter);
        }

        $tradeFilter = $this->requestList($request, 'trade');
        if ($tradeFilter !== []) {
            $query->whereHas('closeoutInstance.template', function (Builder $builder) use ($tradeFilter): void {
                $builder->whereIn('trade', $tradeFilter);
            });
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizedDashboardQuery(Request $request): array
    {
        $query = $request->query();
        ksort($query);

        return $query;
    }

    /**
     * @return array<int, string>
     */
    private function requestList(Request $request, string $key): array
    {
        $value = $request->query($key);

        if (is_string($value)) {
            return collect(explode(',', $value))
                ->map(fn ($item) => trim($item))
                ->filter()
                ->values()
                ->all();
        }

        if (is_array($value)) {
            return collect($value)
                ->map(fn ($item) => trim((string) $item))
                ->filter()
                ->values()
                ->all();
        }

        return [];
    }

    /**
     * @param  Collection<int, Snag>  $snags
     * @param  Collection<int, Carbon>  $rejectedDatesBySnagId
     * @return array{
     *   history: array<int, array{date: string, open: int}>,
     *   projected: array<int, array{date: string, open: int}>,
     *   trend_slope: float,
     *   current_open: int,
     *   projected_open_end: int
     * }
     */
    private function buildForecast(
        Collection $snags,
        Collection $rejectedDatesBySnagId,
        int $historyDays,
        int $projectionDays,
    ): array {
        $history = $this->buildBacklogHistory($snags, $rejectedDatesBySnagId, $historyDays);
        $values = collect($history)->pluck('open')->map(fn ($value) => (float) $value)->values()->all();
        $regression = $this->linearRegression($values);

        $projected = [];
        $today = Carbon::today();
        $n = count($values);
        for ($step = 1; $step <= $projectionDays; $step++) {
            $x = max(0, $n - 1) + $step;
            $estimate = (int) max(0, round($regression['intercept'] + ($regression['slope'] * $x)));
            $projected[] = [
                'date' => $today->copy()->addDays($step)->toDateString(),
                'open' => $estimate,
            ];
        }

        return [
            'history' => $history,
            'projected' => $projected,
            'trend_slope' => round($regression['slope'], 4),
            'current_open' => (int) (collect($history)->last()['open'] ?? 0),
            'projected_open_end' => (int) (collect($projected)->last()['open'] ?? 0),
        ];
    }

    /**
     * @param  Collection<int, Snag>  $snags
     * @param  Collection<int, Carbon>  $rejectedDatesBySnagId
     * @return array<int, array{date: string, open: int}>
     */
    private function buildBacklogHistory(Collection $snags, Collection $rejectedDatesBySnagId, int $historyDays): array
    {
        $today = Carbon::today();
        $dates = collect(range(0, $historyDays - 1))
            ->map(fn (int $offset) => $today->copy()->subDays(($historyDays - 1) - $offset)->toDateString())
            ->values();

        $createdPerDay = $snags
            ->groupBy(fn (Snag $snag) => $snag->created_at->toDateString())
            ->map->count();

        $resolvedPerDay = collect();
        foreach ($snags as $snag) {
            $resolvedAt = $snag->closed_at
                ? Carbon::parse($snag->closed_at)
                : ($rejectedDatesBySnagId->get($snag->id));

            if (! $resolvedAt) {
                continue;
            }

            $key = $resolvedAt->toDateString();
            $resolvedPerDay->put($key, ((int) $resolvedPerDay->get($key, 0)) + 1);
        }

        $openToday = $snags
            ->filter(fn (Snag $snag) => ! in_array($snag->status, [SnagStatus::Closed->value, SnagStatus::Rejected->value], true))
            ->count();

        $openByDate = [];
        $lastDate = $dates->last();
        if ($lastDate === null) {
            return [];
        }

        $openByDate[$lastDate] = $openToday;

        for ($idx = $dates->count() - 2; $idx >= 0; $idx--) {
            $nextDate = $dates[$idx + 1];
            $currentDate = $dates[$idx];
            $netNext = ((int) $createdPerDay->get($nextDate, 0)) - ((int) $resolvedPerDay->get($nextDate, 0));
            $openByDate[$currentDate] = max(0, (int) ($openByDate[$nextDate] - $netNext));
        }

        return $dates
            ->map(fn (string $date) => [
                'date' => $date,
                'open' => (int) ($openByDate[$date] ?? 0),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  array<int, float>  $values
     * @return array{slope: float, intercept: float}
     */
    private function linearRegression(array $values): array
    {
        $n = count($values);
        if ($n === 0) {
            return ['slope' => 0.0, 'intercept' => 0.0];
        }

        if ($n === 1) {
            return ['slope' => 0.0, 'intercept' => $values[0]];
        }

        $sumX = 0.0;
        $sumY = 0.0;
        $sumXY = 0.0;
        $sumX2 = 0.0;

        foreach ($values as $index => $value) {
            $x = (float) $index;
            $y = (float) $value;
            $sumX += $x;
            $sumY += $y;
            $sumXY += $x * $y;
            $sumX2 += $x * $x;
        }

        $denominator = ($n * $sumX2) - ($sumX * $sumX);
        if (abs($denominator) < 0.000001) {
            return ['slope' => 0.0, 'intercept' => $sumY / $n];
        }

        $slope = (($n * $sumXY) - ($sumX * $sumY)) / $denominator;
        $intercept = ($sumY - ($slope * $sumX)) / $n;

        return [
            'slope' => $slope,
            'intercept' => $intercept,
        ];
    }

    private function stakeholderLabel(Snag $snag): string
    {
        if ($snag->assignee) {
            return 'User: '.$snag->assignee->name;
        }

        if ($snag->assignedTeam) {
            return 'Team: '.$snag->assignedTeam->name;
        }

        if ($snag->assignedCompany) {
            return 'Company: '.$snag->assignedCompany->name;
        }

        return 'Unassigned';
    }
}

