<?php

namespace Database\Factories;

use App\Models\Snag;
use App\Models\SnagEscalation;
use App\Models\SnagEscalationRule;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagEscalation>
 */
class SnagEscalationFactory extends Factory
{
    protected $model = SnagEscalation::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn (array $attributes) => Snag::query()->find($attributes['snag_id'])?->organization_id,
            'snag_id' => Snag::factory(),
            'snag_escalation_rule_id' => SnagEscalationRule::factory(),
            'escalated_to_user_id' => User::factory(),
            'triggered_by' => null,
            'escalated_at' => now()->subHours(fake()->numberBetween(1, 24)),
            'status_at_escalation' => fake()->randomElement(['assigned', 'in_progress', 'ready_for_review']),
            'reason' => 'Seeded overdue escalation',
            'meta' => ['source' => 'seed'],
        ];
    }
}
