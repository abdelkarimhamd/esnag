<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CloseoutTemplate extends Model
{
    /** @use HasFactory<\Database\Factories\CloseoutTemplateFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'name',
        'trade',
        'discipline',
        'description',
        'is_default',
        'is_active',
        'is_library',
        'library_key',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'is_library' => 'boolean',
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CloseoutTemplateItem::class)->orderBy('sort_order');
    }

    public function instances(): HasMany
    {
        return $this->hasMany(CloseoutInstance::class);
    }
}
