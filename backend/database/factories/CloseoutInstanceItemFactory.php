<?php

namespace Database\Factories;

use App\Models\CloseoutInstance;
use App\Models\CloseoutTemplateItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CloseoutInstanceItem>
 */
class CloseoutInstanceItemFactory extends Factory
{
    public function definition(): array
    {
        $completed = fake()->boolean(40);

        return [
            'closeout_instance_id' => CloseoutInstance::factory(),
            'closeout_template_item_id' => CloseoutTemplateItem::factory(),
            'title' => fake()->sentence(4),
            'description' => fake()->optional()->sentence(),
            'required' => fake()->boolean(85),
            'evidence_required' => fake()->boolean(70),
            'is_completed' => $completed,
            'completed_at' => $completed ? now()->subHours(fake()->numberBetween(1, 72)) : null,
            'completed_by' => $completed ? User::factory() : null,
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
