<?php

namespace Database\Factories;

use App\Models\SnagComment;
use App\Models\SnagCommentAttachment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagCommentAttachment>
 */
class SnagCommentAttachmentFactory extends Factory
{
    protected $model = SnagCommentAttachment::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn (array $attributes) => SnagComment::query()->find($attributes['snag_comment_id'])?->organization_id,
            'snag_comment_id' => SnagComment::factory(),
            'uploaded_by' => User::factory(),
            'type' => fake()->randomElement(['photo', 'video', 'file']),
            'file_name' => fake()->bothify('comment-file-###.jpg'),
            'file_path' => 'snags/comments/demo/'.fake()->bothify('file-###.jpg'),
            'mime_type' => 'image/jpeg',
            'file_size' => fake()->numberBetween(10000, 500000),
            'metadata' => ['source' => 'seed'],
        ];
    }
}
