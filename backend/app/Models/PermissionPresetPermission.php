<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PermissionPresetPermission extends Model
{
    /** @use HasFactory<\Database\Factories\PermissionPresetPermissionFactory> */
    use HasFactory;

    protected $fillable = [
        'permission_preset_id',
        'permission_name',
    ];

    public function preset(): BelongsTo
    {
        return $this->belongsTo(PermissionPreset::class, 'permission_preset_id');
    }
}
