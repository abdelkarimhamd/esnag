<?php

namespace Database\Factories;

use App\Models\DashboardConfig;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DashboardConfig>
 */
class DashboardConfigFactory extends Factory
{
    protected $model = DashboardConfig::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'name' => fake()->randomElement(['Operations View', 'Consultant Overview', 'SLA Focus']),
            'is_default' => false,
            'cards' => [
                'total_snags',
                'open_snags',
                'overdue_snags',
                'avg_ack_hours',
            ],
            'filters' => [
                'status' => ['new', 'assigned', 'in_progress', 'ready_for_review'],
            ],
            'layout' => [
                ['id' => 'total_snags', 'w' => 3],
                ['id' => 'open_snags', 'w' => 3],
                ['id' => 'overdue_snags', 'w' => 3],
                ['id' => 'avg_ack_hours', 'w' => 3],
            ],
        ];
    }
}

