<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectUserRole extends Model
{
    /** @use HasFactory<\Database\Factories\ProjectUserRoleFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'user_id',
        'role_name',
        'source',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
