<?php

namespace Database\Factories;

use App\Models\CloseoutTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CloseoutTemplateItem>
 */
class CloseoutTemplateItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'closeout_template_id' => CloseoutTemplate::factory(),
            'title' => fake()->randomElement([
                'Work complete as per drawing',
                'QA inspection pass',
                'Material certificate submitted',
                'Photo evidence uploaded',
            ]),
            'description' => fake()->optional()->sentence(),
            'required' => fake()->boolean(85),
            'evidence_required' => fake()->boolean(70),
            'sort_order' => fake()->numberBetween(0, 10),
        ];
    }
}
