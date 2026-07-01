export const FEATURE_ACCESS = {
    projects: { anyOf: ['projects.view'] },
    projectDashboard: { anyOf: ['projects.view'] },
    drawingViewer: { anyOf: ['drawings.view'] },
    board: { anyOf: ['kanban.view'] },
    dashboard: { anyOf: ['dashboard.view'] },
    exports: { anyOf: ['exports.view'] },
    equipment: { anyOf: ['equipment.view'] },
    accessControl: { anyOf: ['projects.manage', 'snags.assign'] },
    automation: { anyOf: ['automation.view', 'automation.manage', 'inspections.recurring.manage', 'inspections.templates.manage'] },
    ops: {
        anyOf: [
            'ops.feature_flags.manage',
            'ops.usage_limits.manage',
            'ops.security.manage',
            'ops.health.view',
            'ops.support.manage',
        ],
    },
    templates: { anyOf: ['inspections.templates.view', 'closeout.templates.view', 'projects.view'] },
    inspectionsSubmissions: { anyOf: ['inspections.submissions.view'] },
    inspectionsRequests: { anyOf: ['inspections.requests.view'] },
    inspectionsReports: { anyOf: ['inspections.reports.view'] },
    notificationPreferences: { anyOf: ['notification.preferences.manage'] },
};
export const hasAnyPermission = (granted, required) => required.some((permissionName) => granted.includes(permissionName));
export const canAccessFeature = (granted, key) => hasAnyPermission(granted, FEATURE_ACCESS[key].anyOf);
