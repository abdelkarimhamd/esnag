<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloseoutInstance extends Model
{
    /** @use HasFactory<\Database\Factories\CloseoutInstanceFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'snag_id',
        'closeout_template_id',
        'status',
        'completion_percentage',
        'created_by',
        'reviewed_by',
        'completed_at',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'completion_percentage' => 'integer',
            'completed_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function snag(): BelongsTo
    {
        return $this->belongsTo(Snag::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(CloseoutTemplate::class, 'closeout_template_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CloseoutInstanceItem::class)->orderBy('id');
    }
}
