<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SnagComment extends Model
{
    /** @use HasFactory<\Database\Factories\SnagCommentFactory> */
    use HasFactory;

    protected $fillable = [
        'snag_id',
        'parent_id',
        'client_uuid',
        'organization_id',
        'user_id',
        'body',
        'is_internal',
    ];

    protected function casts(): array
    {
        return [
            'is_internal' => 'boolean',
        ];
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('created_at');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function mentions(): HasMany
    {
        return $this->hasMany(SnagCommentMention::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SnagCommentAttachment::class)->orderByDesc('created_at');
    }
}

