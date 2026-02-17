<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PermissionPreset extends Model
{
    /** @use HasFactory<\Database\Factories\PermissionPresetFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'preset_key',
        'name',
        'description',
        'is_system',
    ];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(PermissionPresetPermission::class, 'permission_preset_id');
    }
}
