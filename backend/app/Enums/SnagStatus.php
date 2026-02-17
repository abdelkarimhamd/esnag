<?php

namespace App\Enums;

enum SnagStatus: string
{
    case New = 'new';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case ReadyForReview = 'ready_for_review';
    case Closed = 'closed';
    case Rejected = 'rejected';

    public static function labels(): array
    {
        return [
            self::New->value => 'New',
            self::Assigned->value => 'Assigned',
            self::InProgress->value => 'In Progress',
            self::ReadyForReview->value => 'Ready for Review',
            self::Closed->value => 'Closed',
            self::Rejected->value => 'Rejected',
        ];
    }
}

