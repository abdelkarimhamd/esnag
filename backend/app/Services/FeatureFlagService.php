<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\OrganizationFeatureFlag;
use Illuminate\Support\Collection;

class FeatureFlagService
{
    /**
     * @return array<string, array{label: string, description: string, default_enabled: bool}>
     */
    public function catalog(): array
    {
        return [
            'drawings' => [
                'label' => 'Drawings',
                'description' => 'Drawing viewer, revisions, pin migration, and location suggestions.',
                'default_enabled' => true,
            ],
            'kanban' => [
                'label' => 'Kanban',
                'description' => 'Status-board workflow view for snags.',
                'default_enabled' => true,
            ],
            'dashboard' => [
                'label' => 'Analytics Dashboard',
                'description' => 'KPI, SLA, root cause, cost, and forecasting dashboards.',
                'default_enabled' => true,
            ],
            'exports' => [
                'label' => 'Exports',
                'description' => 'CSV/PDF/XLSX export pipeline and download center.',
                'default_enabled' => true,
            ],
            'inspections' => [
                'label' => 'Inspections',
                'description' => 'Template builder, submissions, approvals, signatures, and requests.',
                'default_enabled' => true,
            ],
            'equipment' => [
                'label' => 'Equipment',
                'description' => 'Equipment registry and maintenance logs.',
                'default_enabled' => true,
            ],
            'automation' => [
                'label' => 'Automation',
                'description' => 'Rules engine, reminders, and recurring schedules.',
                'default_enabled' => true,
            ],
            'mobile' => [
                'label' => 'Mobile Sync',
                'description' => 'Mobile sync and chunked attachment pipelines.',
                'default_enabled' => true,
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public function keys(): array
    {
        return array_keys($this->catalog());
    }

    /**
     * @return array<string, bool>
     */
    public function defaultMap(): array
    {
        return collect($this->catalog())
            ->mapWithKeys(fn (array $row, string $key) => [$key => (bool) ($row['default_enabled'] ?? true)])
            ->all();
    }

    /**
     * @return array<string, bool>
     */
    public function resolvedFlags(int $organizationId, ?int $projectId = null): array
    {
        $resolved = $this->defaultMap();
        $keys = $this->keys();

        /** @var Collection<int, OrganizationFeatureFlag> $orgOverrides */
        $orgOverrides = OrganizationFeatureFlag::query()
            ->where('organization_id', $organizationId)
            ->whereNull('project_id')
            ->whereIn('feature_key', $keys)
            ->get();

        foreach ($orgOverrides as $row) {
            $resolved[$row->feature_key] = (bool) $row->is_enabled;
        }

        if ($projectId) {
            /** @var Collection<int, OrganizationFeatureFlag> $projectOverrides */
            $projectOverrides = OrganizationFeatureFlag::query()
                ->where('organization_id', $organizationId)
                ->where('project_id', $projectId)
                ->whereIn('feature_key', $keys)
                ->get();

            foreach ($projectOverrides as $row) {
                $resolved[$row->feature_key] = (bool) $row->is_enabled;
            }
        }

        return $resolved;
    }

    public function isEnabled(int $organizationId, ?int $projectId, string $featureKey): bool
    {
        $resolved = $this->resolvedFlags($organizationId, $projectId);

        return (bool) ($resolved[$featureKey] ?? true);
    }

    /**
     * @param  array<string, bool>  $flagMap
     * @return Collection<int, OrganizationFeatureFlag>
     */
    public function upsertScopeFlags(
        Organization $organization,
        ?int $projectId,
        array $flagMap,
        ?int $updatedBy = null,
    ): Collection {
        $rows = collect();

        foreach ($flagMap as $featureKey => $isEnabled) {
            $row = OrganizationFeatureFlag::query()->updateOrCreate(
                [
                    'organization_id' => $organization->id,
                    'project_id' => $projectId,
                    'feature_key' => $featureKey,
                ],
                [
                    'is_enabled' => (bool) $isEnabled,
                    'updated_by' => $updatedBy,
                ],
            );

            $rows->push($row);
        }

        return $rows;
    }
}
