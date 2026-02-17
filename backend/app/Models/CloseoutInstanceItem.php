<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloseoutInstanceItem extends Model
{
    /** @use HasFactory<\Database\Factories\CloseoutInstanceItemFactory> */
    use HasFactory;

    protected $fillable = [
        'closeout_instance_id',
        'closeout_template_item_id',
        'title',
        'description',
        'required',
        'evidence_required',
        'is_completed',
        'completed_at',
        'completed_by',
        'notes',
    ];

    protected $appends = [
        'is_satisfied',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'evidence_required' => 'boolean',
            'is_completed' => 'boolean',
            'completed_at' => 'datetime',
        ];
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(CloseoutInstance::class, 'closeout_instance_id');
    }

    public function templateItem(): BelongsTo
    {
        return $this->belongsTo(CloseoutTemplateItem::class, 'closeout_template_item_id');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function evidences(): HasMany
    {
        return $this->hasMany(CloseoutEvidence::class);
    }

    public function getIsSatisfiedAttribute(): bool
    {
        if (! $this->required) {
            return true;
        }

        if (! $this->is_completed) {
            return false;
        }

        if (! $this->evidence_required) {
            return true;
        }

        return $this->relationLoaded('evidences')
            ? $this->evidences->isNotEmpty()
            : $this->evidences()->exists();
    }
}
