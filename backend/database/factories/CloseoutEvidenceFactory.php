<?php

namespace Database\Factories;

use App\Models\CloseoutInstanceItem;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CloseoutEvidence>
 */
class CloseoutEvidenceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'closeout_instance_item_id' => CloseoutInstanceItem::factory(),
            'uploaded_by' => User::factory(),
            'file_name' => fake()->bothify('evidence-###.jpg'),
            'file_path' => 'closeout/evidence/'.fake()->uuid().'.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => fake()->numberBetween(12_000, 640_000),
            'metadata' => ['source' => 'factory'],
        ];
    }
}
