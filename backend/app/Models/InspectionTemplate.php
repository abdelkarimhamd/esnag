<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class InspectionTemplate extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionTemplateFactory> */
    use HasFactory;

    protected $fillable = [
        'organization_id',
        'project_id',
        'name',
        'code',
        'type',
        'discipline',
        'description',
        'schema',
        'approval_workflow',
        'is_active',
        'is_library',
        'library_key',
        'version',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'schema' => 'array',
            'approval_workflow' => 'array',
            'is_active' => 'boolean',
            'is_library' => 'boolean',
            'version' => 'integer',
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

    public function submissions(): HasMany
    {
        return $this->hasMany(InspectionSubmission::class);
    }

    public function recurringSchedules(): HasMany
    {
        return $this->hasMany(InspectionRecurringSchedule::class);
    }
}
