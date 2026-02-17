<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloseoutTemplateItem extends Model
{
    /** @use HasFactory<\Database\Factories\CloseoutTemplateItemFactory> */
    use HasFactory;

    protected $fillable = [
        'closeout_template_id',
        'title',
        'description',
        'required',
        'evidence_required',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'evidence_required' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(CloseoutTemplate::class, 'closeout_template_id');
    }

    public function instanceItems(): HasMany
    {
        return $this->hasMany(CloseoutInstanceItem::class);
    }
}
