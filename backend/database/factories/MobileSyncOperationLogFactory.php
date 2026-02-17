<?php

namespace Database\Factories;

use App\Models\MobileSyncOperationLog;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\MobileSyncOperationLog>
 */
class MobileSyncOperationLogFactory extends Factory
{
    protected $model = MobileSyncOperationLog::class;

    public function definition(): array
    {
        $status = fake()->randomElement(['applied', 'applied', 'rejected', 'failed']);

        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'op_id' => Str::uuid()->toString(),
            'operation_type' => fake()->randomElement(['snag.create', 'snag.update', 'snag.transition', 'snag.comment.create']),
            'status' => $status,
            'source' => 'apply',
            'error_code' => $status === 'applied' ? null : 'sync_error',
            'error_message' => $status === 'applied' ? null : fake()->sentence(),
            'payload' => ['seeded' => true],
            'occurred_at' => Carbon::now()->subHours(fake()->numberBetween(0, 48)),
        ];
    }
}

