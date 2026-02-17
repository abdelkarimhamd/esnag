<?php

namespace Database\Factories;

use App\Models\OpsHealthEvent;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\OpsHealthEvent>
 */
class OpsHealthEventFactory extends Factory
{
    protected $model = OpsHealthEvent::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'event_type' => fake()->randomElement(['storage_failure', 'sync_failure', 'quota_breached']),
            'severity' => fake()->randomElement(['warning', 'error', 'critical']),
            'source' => fake()->randomElement(['mobile_upload', 'snag_attachment', 'drawing_revision', 'exports']),
            'message' => fake()->sentence(),
            'context' => ['seeded' => true],
            'occurred_at' => Carbon::now()->subHours(fake()->numberBetween(0, 72)),
        ];
    }
}

