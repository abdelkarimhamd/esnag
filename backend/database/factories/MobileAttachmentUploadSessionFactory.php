<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Snag;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\MobileAttachmentUploadSession>
 */
class MobileAttachmentUploadSessionFactory extends Factory
{
    public function definition(): array
    {
        $uploadUuid = (string) Str::uuid();

        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'snag_id' => Snag::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
                'created_by' => $attributes['user_id'],
            ]),
            'upload_uuid' => $uploadUuid,
            'file_name' => fake()->randomElement(['photo.jpg', 'video.mp4', 'markup.json']),
            'mime_type' => fake()->randomElement(['image/jpeg', 'image/png', 'video/mp4']),
            'total_chunks' => fake()->numberBetween(1, 8),
            'received_chunks' => [0],
            'file_size' => fake()->numberBetween(8000, 6500000),
            'status' => fake()->randomElement(['initiated', 'uploading', 'completed', 'failed']),
            'temp_dir' => 'chunks/'.Str::lower(Str::random(8)).'/'.$uploadUuid,
            'assembled_path' => fake()->optional(0.45)->bothify('snags/org_#/snag_##/chunked_????????.jpg'),
            'expires_at' => now()->addHours(6),
        ];
    }
}
