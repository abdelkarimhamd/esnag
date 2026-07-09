<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class InspectionSubmission extends Model
{
    /** @use HasFactory<\Database\Factories\InspectionSubmissionFactory> */
    use HasFactory;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SUBMITTED = 'submitted';
    public const STATUS_IN_REVIEW = 'in_review';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'organization_id',
        'project_id',
        'handover_request_id',
        'inspection_template_id',
        'commissioning_pack_id',
        'commissioning_stage',
        'reference',
        'status',
        'form_data',
        'current_approval_order',
        'created_by',
        'submitted_by',
        'submitted_at',
        'approved_at',
        'rejected_at',
        'last_updated_by',
    ];

    /**
     * Result tokens that count a checklist item as passed / failed / not-applicable.
     * Mirrors the resolver in web/src/pages/InspectionSubmissionDetailPage.jsx so the
     * server-side completion percent stays in sync with the client donut.
     *
     * @var array<string, list<string>>
     */
    private const RESULT_TOKENS = [
        'pass' => ['pass', 'passed', 'true', 'yes', 'ok', '1'],
        'fail' => ['fail', 'failed', 'false', 'no', '0'],
        'na' => ['na', 'n/a', 'not_applicable'],
    ];

    protected function casts(): array
    {
        return [
            'form_data' => 'array',
            'current_approval_order' => 'integer',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * Completion percent (int 0-100) computed from the checklist results stored in
     * form_data against the template's schema fields. Gradeable items exclude N/A;
     * percent = round(passed / gradeable * 100). When there are no gradeable items
     * yet, approved submissions fall back to 100 and everything else to 0 (matching
     * the frontend fallback in InspectionSubmissionsPage.jsx completionPercent()).
     *
     * Requires the `template` relation to be loaded (with its schema) to avoid N+1;
     * if it is not loaded the accessor degrades to the status-based fallback.
     */
    public function getCompletionPercentAttribute(): int
    {
        $formData = is_array($this->form_data) ? $this->form_data : [];

        $passed = 0;
        $gradeable = 0;

        if ($this->relationLoaded('template') && $this->template !== null) {
            $sections = data_get($this->template->schema, 'sections', []);
            $sections = is_array($sections) ? $sections : [];

            foreach ($sections as $section) {
                $fields = is_array($section) ? ($section['fields'] ?? []) : [];
                $fields = is_array($fields) ? $fields : [];

                foreach ($fields as $field) {
                    $key = is_array($field) ? ($field['key'] ?? null) : null;
                    if ($key === null) {
                        continue;
                    }

                    $result = $this->resolveResult($formData[$key] ?? null);

                    if ($result === 'na' || $result === null) {
                        continue;
                    }

                    $gradeable++;

                    if ($result === 'pass') {
                        $passed++;
                    }
                }
            }
        }

        if ($gradeable === 0) {
            return $this->status === self::STATUS_APPROVED ? 100 : 0;
        }

        return (int) round(($passed / $gradeable) * 100);
    }

    /**
     * Resolve a raw stored checklist value into pass | fail | na | null.
     */
    private function resolveResult(mixed $raw): ?string
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_array($raw)) {
            $nested = $raw['result'] ?? $raw['value'] ?? $raw['status'] ?? null;

            return $nested === null ? null : $this->resolveResult($nested);
        }

        if (is_bool($raw)) {
            $raw = $raw ? 'true' : 'false';
        }

        $token = is_string($raw) ? strtolower(trim($raw)) : (string) $raw;

        foreach (self::RESULT_TOKENS as $result => $tokens) {
            if (in_array($token, $tokens, true)) {
                return $result;
            }
        }

        return null;
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function handoverRequest(): BelongsTo
    {
        return $this->belongsTo(HandoverRequest::class, 'handover_request_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(InspectionTemplate::class, 'inspection_template_id');
    }

    public function commissioningPack(): BelongsTo
    {
        return $this->belongsTo(CommissioningPack::class, 'commissioning_pack_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function lastUpdatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_updated_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(InspectionApproval::class)->orderBy('step_order');
    }

    public function contributions(): HasMany
    {
        return $this->hasMany(InspectionContribution::class)->orderBy('created_at');
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(InspectionSignature::class)->orderByDesc('signed_at');
    }

    public function requests(): HasMany
    {
        return $this->hasMany(InspectionRequest::class);
    }

    public function approvalMessages(): HasMany
    {
        return $this->hasMany(InspectionApprovalMessage::class)->orderBy('created_at');
    }
}
