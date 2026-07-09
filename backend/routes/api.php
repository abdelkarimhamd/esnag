<?php

use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BuildingController;
use App\Http\Controllers\Api\CloseoutInstanceController;
use App\Http\Controllers\Api\CloseoutTemplateController;
use App\Http\Controllers\Api\CommissioningPackController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DashboardConfigController;
use App\Http\Controllers\Api\DelegationRuleController;
use App\Http\Controllers\Api\DrawingController;
use App\Http\Controllers\Api\EquipmentController;
use App\Http\Controllers\Api\EquipmentMaintenanceLogController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\FloorController;
use App\Http\Controllers\Api\HandoverRequestController;
use App\Http\Controllers\Api\HandoverWorkflowController;
use App\Http\Controllers\Api\InspectionApprovalController;
use App\Http\Controllers\Api\InspectionApprovalMessageController;
use App\Http\Controllers\Api\InspectionReportController;
use App\Http\Controllers\Api\InspectionRecurringScheduleController;
use App\Http\Controllers\Api\InspectionRequestController;
use App\Http\Controllers\Api\InspectionSignatureController;
use App\Http\Controllers\Api\InspectionSubmissionController;
use App\Http\Controllers\Api\InspectionTemplateController;
use App\Http\Controllers\Api\KanbanController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\MobileChunkedAttachmentController;
use App\Http\Controllers\Api\MobileAuthDeviceController;
use App\Http\Controllers\Api\MobilePushTokenController;
use App\Http\Controllers\Api\MobileSyncController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\OnboardingTourController;
use App\Http\Controllers\Api\OpsAdminController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\PunchListController;
use App\Http\Controllers\Api\RbacController;
use App\Http\Controllers\Api\RootCauseCategoryController;
use App\Http\Controllers\Api\SnagAttachmentController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SnagBulkActionController;
use App\Http\Controllers\Api\SnagCategoryController;
use App\Http\Controllers\Api\SnagCommentController;
use App\Http\Controllers\Api\SnagController;
use App\Http\Controllers\Api\SnagEscalationRuleController;
use App\Http\Controllers\Api\SnagStatusController;
use App\Http\Controllers\Api\SnagWatcherController;
use App\Http\Controllers\Api\SnagReminderPolicyController;
use App\Http\Controllers\Api\StakeholderController;
use App\Http\Controllers\Api\TakingOverCertificateController;
use App\Http\Controllers\Api\WorkflowAutomationRuleController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/mobile-login', [AuthController::class, 'mobileLogin']);

    Route::middleware('web')->group(function (): void {
        Route::post('/login', [AuthController::class, 'login']);

        Route::middleware('auth:sanctum')->group(function (): void {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
            Route::get('/mfa/status', [AuthController::class, 'mfaStatus']);
            Route::post('/mfa/setup', [AuthController::class, 'mfaSetup']);
            Route::post('/mfa/enable', [AuthController::class, 'mfaEnable']);
            Route::post('/mfa/disable', [AuthController::class, 'mfaDisable']);
        });
    });

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/mobile-logout', [AuthController::class, 'mobileLogout']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/organizations', [OrganizationController::class, 'index']);

    Route::middleware(['organization', 'tenant.ip', 'training.writable'])->group(function (): void {
        Route::get('/organizations/members', [OrganizationController::class, 'members']);

        Route::get('/rbac/context', [RbacController::class, 'context']);
        Route::get('/rbac/permission-presets', [RbacController::class, 'presets']);
        Route::get('/rbac/permission-diff', [RbacController::class, 'permissionDiff']);

        Route::get('/projects', [ProjectController::class, 'index']);
        Route::post('/projects', [ProjectController::class, 'store']);
        Route::get('/projects/{project}', [ProjectController::class, 'show']);
        Route::get('/projects/{project}/dashboard', [ProjectController::class, 'dashboard']);
        Route::get('/projects/{project}/roles', [RbacController::class, 'projectRoles']);
        Route::put('/projects/{project}/roles/{user}', [RbacController::class, 'upsertProjectUserRoles']);

        Route::middleware('feature:drawings')->group(function (): void {
            Route::get('/drawings', [DrawingController::class, 'index']);
            Route::get('/drawings/aggregate', [DrawingController::class, 'aggregate']);
            Route::post('/projects/{project}/drawings', [DrawingController::class, 'store']);
            Route::get('/drawings/{drawing}', [DrawingController::class, 'show']);
            Route::put('/drawings/{drawing}', [DrawingController::class, 'update']);
            Route::get('/drawings/{drawing}/compare', [DrawingController::class, 'compare']);
            Route::post('/drawings/{drawing}/migrate-pins', [DrawingController::class, 'migratePins']);
            Route::get('/drawings/{drawing}/location-suggestions', [DrawingController::class, 'locationSuggestions']);
            Route::post('/drawings/{drawing}/revisions', [DrawingController::class, 'uploadRevision'])->middleware('throttle:uploads');
            Route::patch('/drawings/{drawing}/current-revision/{revision}', [DrawingController::class, 'setCurrentRevision']);
            Route::get('/drawing-revisions/{revision}/file', [DrawingController::class, 'revisionFile']);
            Route::get('/locations/resolve', [LocationController::class, 'resolveByBarcode']);
        });

        Route::get('/snags', [SnagController::class, 'index']);
        Route::post('/snags/bulk-update', [SnagBulkActionController::class, 'update']);
        Route::post('/snags/bulk-transition', [SnagBulkActionController::class, 'transition']);
        Route::post('/snags/bulk-export', [SnagBulkActionController::class, 'export']);
        Route::post('/snags', [SnagController::class, 'store']);
        Route::get('/snags/{snag}', [SnagController::class, 'show']);
        Route::put('/snags/{snag}', [SnagController::class, 'update']);
        Route::delete('/snags/{snag}', [SnagController::class, 'destroy']);

        Route::post('/snags/{snag}/transition', [SnagStatusController::class, 'transition']);
        Route::post('/snags/{snag}/dispatch', [SnagController::class, 'dispatch']);
        Route::post('/snags/{snag}/comments', [SnagCommentController::class, 'store']);
        Route::post('/snag-comments/{comment}/attachments', [SnagCommentController::class, 'storeAttachment'])->middleware('throttle:uploads');
        Route::get('/snag-comment-attachments/{attachment}/download', [SnagCommentController::class, 'downloadAttachment']);
        Route::get('/snags/{snag}/watchers', [SnagWatcherController::class, 'index']);
        Route::post('/snags/{snag}/watchers', [SnagWatcherController::class, 'store']);
        Route::delete('/snags/{snag}/watchers/{user}', [SnagWatcherController::class, 'destroy']);
        Route::post('/snags/{snag}/attachments', [SnagAttachmentController::class, 'store'])->middleware('throttle:uploads');
        Route::get('/snag-attachments/{attachment}/download', [SnagAttachmentController::class, 'download']);
        Route::get('/snag-escalation-rules', [SnagEscalationRuleController::class, 'index']);
        Route::post('/snag-escalation-rules', [SnagEscalationRuleController::class, 'store']);
        Route::put('/snag-escalation-rules/{snagEscalationRule}', [SnagEscalationRuleController::class, 'update']);
        Route::delete('/snag-escalation-rules/{snagEscalationRule}', [SnagEscalationRuleController::class, 'destroy']);
        Route::middleware('feature:automation')->group(function (): void {
            Route::get('/automation/rules', [WorkflowAutomationRuleController::class, 'index']);
            Route::post('/automation/rules', [WorkflowAutomationRuleController::class, 'store']);
            Route::put('/automation/rules/{workflowAutomationRule}', [WorkflowAutomationRuleController::class, 'update']);
            Route::delete('/automation/rules/{workflowAutomationRule}', [WorkflowAutomationRuleController::class, 'destroy']);
            Route::get('/automation/reminder-policies', [SnagReminderPolicyController::class, 'index']);
            Route::post('/automation/reminder-policies', [SnagReminderPolicyController::class, 'store']);
            Route::put('/automation/reminder-policies/{snagReminderPolicy}', [SnagReminderPolicyController::class, 'update']);
            Route::delete('/automation/reminder-policies/{snagReminderPolicy}', [SnagReminderPolicyController::class, 'destroy']);
        });

        Route::get('/stakeholders/companies', [StakeholderController::class, 'companies']);
        Route::post('/stakeholders/companies', [StakeholderController::class, 'storeCompany']);
        Route::put('/stakeholders/companies/{company}', [StakeholderController::class, 'updateCompany']);
        Route::get('/stakeholders/teams', [StakeholderController::class, 'teams']);
        Route::post('/stakeholders/teams', [StakeholderController::class, 'storeTeam']);
        Route::put('/stakeholders/teams/{team}', [StakeholderController::class, 'updateTeam']);

        Route::get('/delegations', [DelegationRuleController::class, 'index']);
        Route::post('/delegations', [DelegationRuleController::class, 'store']);
        Route::delete('/delegations/{delegationRule}', [DelegationRuleController::class, 'destroy']);

        Route::get('/search', [SearchController::class, 'index']);

        Route::get('/kanban/snags', [KanbanController::class, 'index'])->middleware('feature:kanban');
        Route::get('/dashboard/kpis', [DashboardController::class, 'kpis'])->middleware('feature:dashboard');
        Route::get('/dashboard/charts', [DashboardController::class, 'charts'])->middleware('feature:dashboard');
        Route::get('/dashboard/configs', [DashboardConfigController::class, 'index']);
        Route::post('/dashboard/configs', [DashboardConfigController::class, 'store']);
        Route::put('/dashboard/configs/{dashboardConfig}', [DashboardConfigController::class, 'update']);
        Route::delete('/dashboard/configs/{dashboardConfig}', [DashboardConfigController::class, 'destroy']);

        Route::get('/ops/feature-flags', [OpsAdminController::class, 'featureFlags']);
        Route::put('/ops/feature-flags', [OpsAdminController::class, 'upsertFeatureFlags']);
        Route::get('/ops/usage-limits', [OpsAdminController::class, 'usageLimits']);
        Route::put('/ops/usage-limits', [OpsAdminController::class, 'updateUsageLimits']);
        Route::get('/ops/security', [OpsAdminController::class, 'securitySettings']);
        Route::put('/ops/security', [OpsAdminController::class, 'updateSecuritySettings']);
        Route::get('/ops/health', [OpsAdminController::class, 'health']);
        Route::get('/ops/support/invites', [OpsAdminController::class, 'invites']);
        Route::post('/ops/support/invites', [OpsAdminController::class, 'createInvite']);
        Route::post('/ops/support/invites/{organizationInvite}/resend', [OpsAdminController::class, 'resendInvite']);
        Route::post('/ops/support/users/{user}/reset-mfa', [OpsAdminController::class, 'resetMfa']);
        Route::post('/ops/support/users/{user}/reset-onboarding', [OpsAdminController::class, 'resetOnboarding']);
        Route::post('/ops/support/users/{user}/replay-tours', [OpsAdminController::class, 'replayTours']);

        Route::get('/root-cause-categories', [RootCauseCategoryController::class, 'index']);
        Route::post('/root-cause-categories', [RootCauseCategoryController::class, 'store']);
        Route::put('/root-cause-categories/{rootCauseCategory}', [RootCauseCategoryController::class, 'update']);

        // Snag category master (BR-FR-026) — distinct from root cause and severity.
        Route::get('/snag-categories', [SnagCategoryController::class, 'index']);
        Route::post('/snag-categories', [SnagCategoryController::class, 'store']);
        Route::put('/snag-categories/{snagCategory}', [SnagCategoryController::class, 'update']);

        // Location hierarchy master data: Area -> Building -> Floor -> Location (BR-FR-028/030).
        Route::get('/areas', [AreaController::class, 'index']);
        Route::post('/areas', [AreaController::class, 'store']);
        Route::put('/areas/{area}', [AreaController::class, 'update']);
        Route::delete('/areas/{area}', [AreaController::class, 'destroy']);

        Route::get('/buildings', [BuildingController::class, 'index']);
        Route::post('/buildings', [BuildingController::class, 'store']);
        Route::put('/buildings/{building}', [BuildingController::class, 'update']);
        Route::delete('/buildings/{building}', [BuildingController::class, 'destroy']);

        Route::get('/floors', [FloorController::class, 'index']);
        Route::post('/floors', [FloorController::class, 'store']);
        Route::put('/floors/{floor}', [FloorController::class, 'update']);
        Route::delete('/floors/{floor}', [FloorController::class, 'destroy']);

        Route::get('/locations', [LocationController::class, 'index']);
        Route::post('/locations', [LocationController::class, 'store']);
        Route::put('/locations/{location}', [LocationController::class, 'update']);
        Route::delete('/locations/{location}', [LocationController::class, 'destroy']);

        Route::get('/closeout/templates', [CloseoutTemplateController::class, 'index']);
        Route::post('/closeout/templates', [CloseoutTemplateController::class, 'store']);
        Route::post('/closeout/templates/{closeoutTemplate}/clone', [CloseoutTemplateController::class, 'cloneFromLibrary']);
        Route::get('/closeout/templates/{closeoutTemplate}', [CloseoutTemplateController::class, 'show']);
        Route::put('/closeout/templates/{closeoutTemplate}', [CloseoutTemplateController::class, 'update']);
        Route::delete('/closeout/templates/{closeoutTemplate}', [CloseoutTemplateController::class, 'destroy']);

        Route::get('/snags/{snag}/closeout', [CloseoutInstanceController::class, 'show']);
        Route::put('/snags/{snag}/closeout', [CloseoutInstanceController::class, 'upsert']);
        Route::post('/snags/{snag}/closeout/review', [CloseoutInstanceController::class, 'review']);
        Route::patch('/closeout/items/{item}', [CloseoutInstanceController::class, 'updateItem']);
        Route::post('/closeout/items/{item}/evidence', [CloseoutInstanceController::class, 'uploadEvidence'])->middleware('throttle:uploads');
        Route::get('/closeout/evidence/{evidence}/download', [CloseoutInstanceController::class, 'downloadEvidence']);

        Route::get('/punch-lists', [PunchListController::class, 'index']);
        Route::post('/punch-lists', [PunchListController::class, 'store']);
        Route::get('/punch-lists/{punchList}', [PunchListController::class, 'show']);
        Route::put('/punch-lists/{punchList}', [PunchListController::class, 'update']);
        Route::delete('/punch-lists/{punchList}', [PunchListController::class, 'destroy']);
        Route::post('/punch-lists/{punchList}/snags', [PunchListController::class, 'attachSnags']);
        Route::delete('/punch-lists/{punchList}/snags/{snag}', [PunchListController::class, 'detachSnag']);

        Route::get('/commissioning/overview', [CommissioningPackController::class, 'overview']);
        Route::get('/commissioning/packs', [CommissioningPackController::class, 'index']);
        Route::post('/commissioning/packs', [CommissioningPackController::class, 'store']);
        Route::get('/commissioning/packs/{commissioningPack}', [CommissioningPackController::class, 'show']);
        Route::put('/commissioning/packs/{commissioningPack}', [CommissioningPackController::class, 'update']);
        Route::delete('/commissioning/packs/{commissioningPack}', [CommissioningPackController::class, 'destroy']);
        Route::post('/commissioning/packs/{commissioningPack}/advance-stage', [CommissioningPackController::class, 'advanceStage']);
        Route::post('/commissioning/packs/{commissioningPack}/witness-signoffs', [CommissioningPackController::class, 'storeWitnessSignoff']);
        Route::post('/commissioning/packs/{commissioningPack}/submissions', [CommissioningPackController::class, 'attachSubmission']);
        Route::delete('/commissioning/packs/{commissioningPack}/submissions/{inspectionSubmission}', [CommissioningPackController::class, 'detachSubmission']);

        Route::get('/handover/overview', [TakingOverCertificateController::class, 'overview']);
        Route::get('/handover/next-reference', [TakingOverCertificateController::class, 'nextReferenceSuggestion']);
        Route::get('/handover/certificates', [TakingOverCertificateController::class, 'index']);
        Route::post('/handover/certificates', [TakingOverCertificateController::class, 'store']);
        Route::get('/handover/certificates/{takingOverCertificate}', [TakingOverCertificateController::class, 'show']);
        Route::put('/handover/certificates/{takingOverCertificate}', [TakingOverCertificateController::class, 'update']);
        Route::delete('/handover/certificates/{takingOverCertificate}', [TakingOverCertificateController::class, 'destroy']);
        Route::post('/handover/certificates/{takingOverCertificate}/issue', [TakingOverCertificateController::class, 'issue']);
        Route::post('/handover/certificates/{takingOverCertificate}/sign', [TakingOverCertificateController::class, 'sign']);
        Route::post('/handover/certificates/{takingOverCertificate}/close', [TakingOverCertificateController::class, 'close']);
        Route::post('/handover/certificates/{takingOverCertificate}/punch-lists', [TakingOverCertificateController::class, 'attachPunchList']);
        Route::post('/handover/certificates/{takingOverCertificate}/snags', [TakingOverCertificateController::class, 'attachSnags']);
        Route::post('/handover/certificates/{takingOverCertificate}/documents', [TakingOverCertificateController::class, 'storeDocument']);
        Route::put('/handover/certificates/{takingOverCertificate}/documents/{item}', [TakingOverCertificateController::class, 'updateDocument']);
        Route::post('/handover/certificates/{takingOverCertificate}/documents/{item}/upload', [TakingOverCertificateController::class, 'uploadDocument'])->middleware('throttle:uploads');
        Route::get('/handover/certificates/{takingOverCertificate}/documents/{item}/download', [TakingOverCertificateController::class, 'downloadDocument']);
        Route::delete('/handover/certificates/{takingOverCertificate}/documents/{item}', [TakingOverCertificateController::class, 'destroyDocument']);

        // Multi-party handover ROUTING engine (BR-FR-001..008). Distinct from the
        // /handover/* Taking-Over Certificate feature above.
        Route::get('/handovers/workflows', [HandoverWorkflowController::class, 'index']);
        Route::post('/handovers/workflows', [HandoverWorkflowController::class, 'store']);
        Route::get('/handovers/workflows/resolve', [HandoverWorkflowController::class, 'resolve']);
        Route::get('/handovers/workflows/{handoverWorkflow}', [HandoverWorkflowController::class, 'show']);

        Route::get('/handovers/requests', [HandoverRequestController::class, 'index']);
        Route::post('/handovers/requests', [HandoverRequestController::class, 'store']);
        Route::get('/handovers/requests/{handoverRequest}', [HandoverRequestController::class, 'show']);
        Route::get('/handovers/requests/{handoverRequest}/summary', [HandoverRequestController::class, 'summary']);
        Route::get('/handovers/requests/{handoverRequest}/events', [HandoverRequestController::class, 'events']);
        Route::get('/handovers/requests/{handoverRequest}/audit-export', [HandoverRequestController::class, 'auditExport']);
        Route::post('/handovers/requests/{handoverRequest}/submit', [HandoverRequestController::class, 'submit']);
        Route::post('/handovers/requests/{handoverRequest}/act', [HandoverRequestController::class, 'act']);
        Route::post('/handovers/requests/{handoverRequest}/assign', [HandoverRequestController::class, 'assign']);
        Route::post('/handovers/requests/{handoverRequest}/close', [HandoverRequestController::class, 'close']);
        Route::post('/handovers/requests/{handoverRequest}/cancel', [HandoverRequestController::class, 'cancel']);
        Route::post('/handovers/requests/{handoverRequest}/snags', [HandoverRequestController::class, 'attachSnags']);
        Route::post('/handovers/requests/{handoverRequest}/inspections', [HandoverRequestController::class, 'attachInspections']);
        Route::post('/handovers/requests/{handoverRequest}/request-inspection', [HandoverRequestController::class, 'requestInspection']);
        Route::get('/handovers/requests/{handoverRequest}/attachments', [HandoverRequestController::class, 'attachments']);
        Route::post('/handovers/requests/{handoverRequest}/attachments', [HandoverRequestController::class, 'storeAttachment'])->middleware('throttle:uploads');
        Route::get('/handovers/requests/{handoverRequest}/attachments/{attachment}', [HandoverRequestController::class, 'downloadAttachment']);

        Route::get('/handovers/requests/{handoverRequest}/comments', [HandoverRequestController::class, 'comments']);
        Route::post('/handovers/requests/{handoverRequest}/comments', [HandoverRequestController::class, 'storeComment']);

        // Unified cross-entity audit trail (item 9 / BR-FR-009/010, BR-BR-013, §11.3).
        Route::get('/audit/events', [AuditController::class, 'index']);
        Route::get('/audit/events/export', [AuditController::class, 'export']);

        Route::middleware('feature:exports')->group(function (): void {
            Route::get('/exports', [ExportController::class, 'index']);
            Route::post('/exports', [ExportController::class, 'store']);
            Route::get('/exports/{exportJob}', [ExportController::class, 'show']);
            Route::get('/exports/{exportJob}/download', [ExportController::class, 'download']);
        });

        Route::middleware('feature:inspections')->group(function (): void {
            Route::get('/inspections/templates', [InspectionTemplateController::class, 'index']);
            Route::post('/inspections/templates', [InspectionTemplateController::class, 'store']);
            Route::post('/inspections/templates/{inspectionTemplate}/clone', [InspectionTemplateController::class, 'cloneFromLibrary']);
            Route::get('/inspections/templates/{inspectionTemplate}', [InspectionTemplateController::class, 'show']);
            Route::put('/inspections/templates/{inspectionTemplate}', [InspectionTemplateController::class, 'update']);
            Route::delete('/inspections/templates/{inspectionTemplate}', [InspectionTemplateController::class, 'destroy']);
            Route::get('/inspections/recurring-schedules', [InspectionRecurringScheduleController::class, 'index']);
            Route::post('/inspections/recurring-schedules', [InspectionRecurringScheduleController::class, 'store']);
            Route::put('/inspections/recurring-schedules/{inspectionRecurringSchedule}', [InspectionRecurringScheduleController::class, 'update']);
            Route::delete('/inspections/recurring-schedules/{inspectionRecurringSchedule}', [InspectionRecurringScheduleController::class, 'destroy']);

            Route::get('/inspections/submissions', [InspectionSubmissionController::class, 'index']);
            Route::post('/inspections/submissions', [InspectionSubmissionController::class, 'store']);
            Route::get('/inspections/submissions/{inspectionSubmission}', [InspectionSubmissionController::class, 'show']);
            Route::put('/inspections/submissions/{inspectionSubmission}', [InspectionSubmissionController::class, 'update']);
            Route::post('/inspections/submissions/{inspectionSubmission}/submit', [InspectionSubmissionController::class, 'submit']);
            Route::post('/inspections/submissions/{inspectionSubmission}/approve', [InspectionApprovalController::class, 'decide']);
            Route::post('/inspections/submissions/{inspectionSubmission}/approval-messages', [InspectionApprovalMessageController::class, 'store']);
            Route::post('/inspections/submissions/{inspectionSubmission}/signatures', [InspectionSignatureController::class, 'store'])->middleware('throttle:uploads');
            Route::get('/inspections/signatures/{inspectionSignature}/download', [InspectionSignatureController::class, 'download']);

            Route::get('/inspections/requests', [InspectionRequestController::class, 'index']);
            Route::post('/inspections/requests', [InspectionRequestController::class, 'store']);
            Route::get('/inspections/requests/{inspectionRequest}', [InspectionRequestController::class, 'show']);
            Route::put('/inspections/requests/{inspectionRequest}', [InspectionRequestController::class, 'update']);

            Route::get('/inspections/reports', [InspectionReportController::class, 'index']);
            Route::post('/inspections/reports/export', [InspectionReportController::class, 'export']);
        });

        Route::middleware('feature:equipment')->group(function (): void {
            Route::get('/equipment', [EquipmentController::class, 'index']);
            Route::post('/equipment', [EquipmentController::class, 'store']);
            Route::get('/equipment/{equipment}', [EquipmentController::class, 'show']);
            Route::put('/equipment/{equipment}', [EquipmentController::class, 'update']);
            Route::get('/equipment/{equipment}/logs', [EquipmentMaintenanceLogController::class, 'index']);
            Route::post('/equipment/{equipment}/logs', [EquipmentMaintenanceLogController::class, 'store']);
        });

        Route::get('/preferences/notifications', [NotificationPreferenceController::class, 'show']);
        Route::put('/preferences/notifications', [NotificationPreferenceController::class, 'update']);

        Route::middleware('feature:mobile')->group(function (): void {
            Route::get('/mobile/push-tokens', [MobilePushTokenController::class, 'index']);
            Route::post('/mobile/push-tokens', [MobilePushTokenController::class, 'store']);
            Route::delete('/mobile/push-tokens/{tokenId}', [MobilePushTokenController::class, 'destroy']);
            Route::get('/mobile/devices', [MobileAuthDeviceController::class, 'index']);
            Route::delete('/mobile/devices/{mobileAuthDevice}', [MobileAuthDeviceController::class, 'destroy']);
            Route::get('/mobile/sync/pull', [MobileSyncController::class, 'pull'])->middleware('throttle:sync');
            Route::post('/mobile/sync/apply', [MobileSyncController::class, 'apply'])->middleware('throttle:sync');
            Route::post('/mobile/attachments/chunked/init', [MobileChunkedAttachmentController::class, 'init'])->middleware('throttle:uploads');
            Route::post('/mobile/attachments/chunked/{session}/chunk', [MobileChunkedAttachmentController::class, 'chunk'])->middleware('throttle:uploads');
            Route::post('/mobile/attachments/chunked/{session}/complete', [MobileChunkedAttachmentController::class, 'complete'])->middleware('throttle:uploads');
        });

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/{notificationId}/read', [NotificationController::class, 'markRead']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

        Route::get('/onboarding/{tourKey}', [OnboardingTourController::class, 'show']);
        Route::put('/onboarding/{tourKey}', [OnboardingTourController::class, 'update']);
    });
});

