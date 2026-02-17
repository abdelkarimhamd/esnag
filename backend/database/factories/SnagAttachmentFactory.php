<?php

namespace Database\Factories;

use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagAttachment>
 */
class SnagAttachmentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'snag_id' => Snag::factory(),
            'organization_id' => fn (array $attributes) => Snag::query()->find($attributes['snag_id'])?->organization_id,
            'uploaded_by' => User::factory(),
            'type' => fake()->randomElement(['photo', 'video', 'markup']),
            'file_name' => fake()->bothify('attachment-###.jpg'),
            'file_path' => 'snags/demo/'.fake()->bothify('attachment-###.jpg'),
            'mime_type' => 'image/jpeg',
            'file_size' => fake()->numberBetween(15000, 450000),
            'markup_data' => null,
            'metadata' => ['source' => 'seed'],
        ];
    }
}

