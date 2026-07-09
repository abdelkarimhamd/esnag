<?php

namespace App\Support;

/**
 * The stage actions of the multi-party handover routing engine (BRD §6.3 / §10).
 * Each action maps to a `handover.*` permission verb (already in PermissionCatalog);
 * return/reject/revise require a mandatory reason (BR-BR-003).
 */
class HandoverActions
{
    public const CREATE = 'create';
    public const SUBMIT = 'submit';
    public const COMMENT = 'comment';
    public const FORWARD = 'forward';
    public const APPROVE = 'approve';
    public const RETURN = 'return';
    public const REJECT = 'reject';
    public const REVISE = 'revise';
    public const CONSOLIDATE = 'consolidate';
    public const ASSIGN = 'assign';
    public const CLOSE = 'close';

    /**
     * Cancel a submitted transaction (BR-BR-014). Not a stage-routing action —
     * it does not appear in a stage's permitted_actions and is handled by a
     * dedicated service method with its own authority + mandatory-reason gate.
     */
    public const CANCEL = 'cancel';

    /** All actions that may appear in a stage's permitted_actions list. */
    public const ALL = [
        self::COMMENT, self::SUBMIT, self::FORWARD, self::APPROVE,
        self::RETURN, self::REJECT, self::REVISE, self::CONSOLIDATE,
        self::ASSIGN, self::CLOSE,
    ];

    /** Actions that route the record backwards to an earlier stage. */
    public const ROUTES_BACK = [self::RETURN, self::REJECT, self::REVISE];

    /** Actions that advance the record forward. */
    public const ROUTES_FORWARD = [self::FORWARD, self::APPROVE];

    /** Actions that require a non-empty reason (BR-BR-003 / BR-FR-032). */
    public const REASON_REQUIRED = [self::RETURN, self::REJECT, self::REVISE];

    /**
     * The RBAC permission verb that authorizes this action. Reject reuses the
     * return verb (it is a stronger return); everything else is handover.<action>.
     */
    public static function verb(string $action): string
    {
        return match ($action) {
            self::REJECT => 'handover.return',
            default => 'handover.'.$action,
        };
    }

    public static function isValid(string $action): bool
    {
        return in_array($action, self::ALL, true);
    }
}
