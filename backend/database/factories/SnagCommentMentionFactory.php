<?php

namespace Database\Factories;

use App\Models\SnagComment;
use App\Models\SnagCommentMention;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SnagCommentMention>
 */
class SnagCommentMentionFactory extends Factory
{
    protected $model = SnagCommentMention::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn (array $attributes) => SnagComment::query()->find($attributes['snag_comment_id'])?->organization_id,
            'snag_comment_id' => SnagComment::factory(),
            'mentioned_user_id' => User::factory(),
            'mentioned_team_id' => null,
            'token' => '@user:'.fake()->numberBetween(1, 999),
            'meta' => ['source' => 'seed'],
        ];
    }
}
