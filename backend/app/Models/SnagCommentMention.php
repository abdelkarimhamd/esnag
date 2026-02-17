<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnagCommentMention extends Model
{
    /** @use HasFactory<\Database\Factories\SnagCommentMentionFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'snag_comment_id',
        'mentioned_user_id',
        'mentioned_team_id',
        'token',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(SnagComment::class, 'snag_comment_id');
    }

    public function mentionedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'mentioned_user_id');
    }

    public function mentionedTeam(): BelongsTo
    {
        return $this->belongsTo(StakeholderTeam::class, 'mentioned_team_id');
    }
}
