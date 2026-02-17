<?php

namespace App\Services;

use App\Models\DrawingRevision;
use App\Models\ExportJob;
use App\Models\InspectionSignature;
use App\Models\Organization;
use App\Models\OrganizationInvite;
use App\Models\OrganizationUsageLimit;
use App\Models\SnagAttachment;
use App\Models\SnagCommentAttachment;
use App\Models\CloseoutEvidence;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UsageLimitService
{
    public const DEFAULT_STORAGE_QUOTA_MB = 5120;
    public const DEFAULT_MAX_EXPORTS_PER_DAY = 100;
    public const DEFAULT_MAX_USERS = 250;

    public function ensureLimits(Organization $organization, ?int $updatedBy = null): OrganizationUsageLimit
    {
        return OrganizationUsageLimit::query()->firstOrCreate(
            ['organization_id' => $organization->id],
            [
                'storage_quota_mb' => self::DEFAULT_STORAGE_QUOTA_MB,
                'max_exports_per_day' => self::DEFAULT_MAX_EXPORTS_PER_DAY,
                'max_users' => self::DEFAULT_MAX_USERS,
                'updated_by' => $updatedBy,
            ],
        );
    }

    /**
     * @return array{
     *   active_users: int,
     *   pending_invites: int,
     *   exports_today: int,
     *   storage_used_bytes: int,
     *   storage_used_mb: float
     * }
     */
    public function usageSnapshot(int $organizationId): array
    {
        $activeUsers = (int) DB::table('organization_user')
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->count();

        $pendingInvites = (int) OrganizationInvite::query()
            ->where('organization_id', $organizationId)
            ->where('status', 'pending')
            ->count();

        $exportsToday = (int) ExportJob::query()
            ->where('organization_id', $organizationId)
            ->whereDate('created_at', Carbon::today())
            ->count();

        $storageBytes = $this->sumStorageBytes($organizationId);

        return [
            'active_users' => $activeUsers,
            'pending_invites' => $pendingInvites,
            'exports_today' => $exportsToday,
            'storage_used_bytes' => $storageBytes,
            'storage_used_mb' => round($storageBytes / 1048576, 2),
        ];
    }

    public function assertCanRequestExport(Organization $organization): void
    {
        $limits = $this->ensureLimits($organization);
        $usage = $this->usageSnapshot($organization->id);

        if ($usage['exports_today'] >= $limits->max_exports_per_day) {
            throw ValidationException::withMessages([
                'exports' => [
                    sprintf(
                        'Export limit reached for today (%d/%d).',
                        $usage['exports_today'],
                        $limits->max_exports_per_day
                    ),
                ],
            ]);
        }
    }

    public function assertCanCreateInvite(Organization $organization): void
    {
        $limits = $this->ensureLimits($organization);
        $usage = $this->usageSnapshot($organization->id);

        $allocatedSeats = $usage['active_users'] + $usage['pending_invites'];

        if ($allocatedSeats >= $limits->max_users) {
            throw ValidationException::withMessages([
                'users' => [
                    sprintf(
                        'User limit reached (%d/%d active + pending seats).',
                        $allocatedSeats,
                        $limits->max_users
                    ),
                ],
            ]);
        }
    }

    public function assertCanConsumeStorage(Organization $organization, int $incomingBytes): void
    {
        if ($incomingBytes <= 0) {
            return;
        }

        $limits = $this->ensureLimits($organization);
        $usage = $this->usageSnapshot($organization->id);

        $quotaBytes = max(1, (int) $limits->storage_quota_mb) * 1048576;
        $nextTotal = $usage['storage_used_bytes'] + $incomingBytes;

        if ($nextTotal > $quotaBytes) {
            $remainingMb = round(max(0, $quotaBytes - $usage['storage_used_bytes']) / 1048576, 2);
            throw ValidationException::withMessages([
                'storage' => [
                    sprintf(
                        'Storage quota exceeded. Required %.2f MB, available %.2f MB.',
                        round($incomingBytes / 1048576, 2),
                        $remainingMb
                    ),
                ],
            ]);
        }
    }

    private function sumStorageBytes(int $organizationId): int
    {
        $snagAttachmentBytes = (int) SnagAttachment::query()
            ->where('organization_id', $organizationId)
            ->sum('file_size');

        $commentAttachmentBytes = (int) SnagCommentAttachment::query()
            ->where('organization_id', $organizationId)
            ->sum('file_size');

        $drawingRevisionBytes = (int) DrawingRevision::query()
            ->where('organization_id', $organizationId)
            ->sum('file_size');

        $closeoutEvidenceBytes = (int) CloseoutEvidence::query()
            ->where('organization_id', $organizationId)
            ->sum('file_size');

        $inspectionSignatureBytes = (int) InspectionSignature::query()
            ->where('organization_id', $organizationId)
            ->sum('file_size');

        return $snagAttachmentBytes
            + $commentAttachmentBytes
            + $drawingRevisionBytes
            + $closeoutEvidenceBytes
            + $inspectionSignatureBytes;
    }
}
