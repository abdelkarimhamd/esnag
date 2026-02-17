<?php

namespace App\Support;

use App\Enums\SnagStatus;

class SnagWorkflow
{
    /**
     * @return array<string, array<string>>
     */
    public static function transitions(): array
    {
        return [
            SnagStatus::New->value => [SnagStatus::Assigned->value, SnagStatus::Rejected->value],
            SnagStatus::Assigned->value => [SnagStatus::InProgress->value, SnagStatus::Rejected->value],
            SnagStatus::InProgress->value => [SnagStatus::ReadyForReview->value, SnagStatus::Rejected->value],
            SnagStatus::ReadyForReview->value => [SnagStatus::Closed->value, SnagStatus::InProgress->value, SnagStatus::Rejected->value],
            SnagStatus::Rejected->value => [SnagStatus::Assigned->value],
            SnagStatus::Closed->value => [],
        ];
    }

    public static function canTransition(string $fromStatus, string $toStatus): bool
    {
        return in_array($toStatus, self::transitions()[$fromStatus] ?? [], true);
    }
}

