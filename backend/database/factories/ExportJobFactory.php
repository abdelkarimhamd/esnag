<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ExportJob>
 */
class ExportJobFactory extends Factory
{
    public function definition(): array
    {
        $status = fake()->randomElement(['queued', 'processing', 'completed', 'failed']);

        return [
            'organization_id' => Organization::factory(),
            'requested_by' => User::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'type' => fake()->randomElement(['pdf', 'csv', 'xlsx']),
            'status' => $status,
            'filters' => ['status' => ['new', 'assigned']],
            'file_name' => $status === 'completed' ? 'export-'.Str::random(8).'.csv' : null,
            'file_path' => $status === 'completed' ? 'exports/demo/'.Str::random(8).'.csv' : null,
            'mime_type' => $status === 'completed' ? 'text/csv' : null,
            'download_token' => Str::random(40),
            'error_message' => $status === 'failed' ? 'Failed to generate export.' : null,
            'completed_at' => in_array($status, ['completed', 'failed'], true) ? now() : null,
        ];
    }
}
