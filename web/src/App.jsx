import { Suspense, lazy } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { DrawingViewerPage } from './pages/DrawingViewerPage';
import { KanbanBoardPage } from './pages/KanbanBoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { AppLayout } from './layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PermissionRoute } from './components/PermissionRoute';
import { HomePage } from './pages/HomePage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { FEATURE_ACCESS } from './utils/permissions';
const ExportCenterPage = lazy(() => import('./pages/ExportCenterPage').then((module) => ({ default: module.ExportCenterPage })));
const InspectionReportsPage = lazy(() => import('./pages/InspectionReportsPage').then((module) => ({ default: module.InspectionReportsPage })));
const InspectionRequestsPage = lazy(() => import('./pages/InspectionRequestsPage').then((module) => ({ default: module.InspectionRequestsPage })));
const InspectionSubmissionDetailPage = lazy(() => import('./pages/InspectionSubmissionDetailPage').then((module) => ({ default: module.InspectionSubmissionDetailPage })));
const InspectionSubmissionsPage = lazy(() => import('./pages/InspectionSubmissionsPage').then((module) => ({ default: module.InspectionSubmissionsPage })));
const TemplatesHubPage = lazy(() => import('./pages/TemplatesHubPage').then((module) => ({ default: module.TemplatesHubPage })));
const EquipmentPage = lazy(() => import('./pages/EquipmentPage').then((module) => ({ default: module.EquipmentPage })));
const NotificationPreferencesPage = lazy(() => import('./pages/NotificationPreferencesPage').then((module) => ({ default: module.NotificationPreferencesPage })));
const AccessControlPage = lazy(() => import('./pages/AccessControlPage').then((module) => ({ default: module.AccessControlPage })));
const WorkflowAutomationPage = lazy(() => import('./pages/WorkflowAutomationPage').then((module) => ({ default: module.WorkflowAutomationPage })));
const OpsAdminPage = lazy(() => import('./pages/OpsAdminPage').then((module) => ({ default: module.OpsAdminPage })));
const PunchListsPage = lazy(() => import('./pages/PunchListsPage').then((module) => ({ default: module.PunchListsPage })));
const CommissioningPage = lazy(() => import('./pages/CommissioningPage').then((module) => ({ default: module.CommissioningPage })));
const HandoverPage = lazy(() => import('./pages/HandoverPage').then((module) => ({ default: module.HandoverPage })));
const MasterDataPage = lazy(() => import('./pages/MasterDataPage').then((module) => ({ default: module.MasterDataPage })));
const HandoverRequestsPage = lazy(() => import('./pages/HandoverRequestsPage').then((module) => ({ default: module.HandoverRequestsPage })));
const WorkflowConfigPage = lazy(() => import('./pages/WorkflowConfigPage').then((module) => ({ default: module.WorkflowConfigPage })));
const AuditTrailPage = lazy(() => import('./pages/AuditTrailPage').then((module) => ({ default: module.AuditTrailPage })));
const DrawingOverlayPage = lazy(() => import('./pages/DrawingOverlayPage').then((module) => ({ default: module.DrawingOverlayPage })));
const LazyPageFallback = <div style={{ padding: 16 }}>Loading module...</div>;
function App() {
    return (<Router>
      <Routes>
        <Route path="/login" element={<LoginPage />}/>

        <Route path="/" element={<ProtectedRoute>
              <RouteErrorBoundary>
                <AppLayout />
              </RouteErrorBoundary>
            </ProtectedRoute>}>
          <Route index element={<Navigate to="/home" replace/>}/>
          <Route path="home" element={<HomePage />}/>
          <Route path="search" element={<SearchResultsPage />}/>
          <Route path="projects" element={<PermissionRoute requiredAny={FEATURE_ACCESS.projects.anyOf}>
                <ProjectsPage />
              </PermissionRoute>}/>
          <Route path="projects/:projectId" element={<PermissionRoute requiredAny={FEATURE_ACCESS.projectDashboard.anyOf}>
                <ProjectDashboardPage />
              </PermissionRoute>}/>
          <Route path="projects/:projectId/drawings/:drawingId" element={<PermissionRoute requiredAny={FEATURE_ACCESS.drawingViewer.anyOf}>
                <DrawingViewerPage />
              </PermissionRoute>}/>
          <Route path="overlay" element={<PermissionRoute requiredAny={FEATURE_ACCESS.drawingOverlay.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <DrawingOverlayPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="board" element={<PermissionRoute requiredAny={FEATURE_ACCESS.board.anyOf}>
                <KanbanBoardPage />
              </PermissionRoute>}/>
          <Route path="dashboard" element={<PermissionRoute requiredAny={FEATURE_ACCESS.dashboard.anyOf}>
                <DashboardPage />
              </PermissionRoute>}/>
          <Route path="exports" element={<PermissionRoute requiredAny={FEATURE_ACCESS.exports.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <ExportCenterPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="equipment" element={<PermissionRoute requiredAny={FEATURE_ACCESS.equipment.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <EquipmentPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="commissioning" element={<PermissionRoute requiredAny={FEATURE_ACCESS.commissioning.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <CommissioningPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="punch-lists" element={<PermissionRoute requiredAny={FEATURE_ACCESS.punchLists.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <PunchListsPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="handover" element={<PermissionRoute requiredAny={FEATURE_ACCESS.handover.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <HandoverPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="access-control" element={<PermissionRoute requiredAny={FEATURE_ACCESS.accessControl.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <AccessControlPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="automation" element={<PermissionRoute requiredAny={FEATURE_ACCESS.automation.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <WorkflowAutomationPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="ops" element={<PermissionRoute requiredAny={FEATURE_ACCESS.ops.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <OpsAdminPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="master-data" element={<PermissionRoute requiredAny={FEATURE_ACCESS.masterData.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <MasterDataPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="handovers" element={<PermissionRoute requiredAny={FEATURE_ACCESS.handoverRequests.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <HandoverRequestsPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="handovers/workflow" element={<PermissionRoute requiredAny={FEATURE_ACCESS.workflowConfig.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <WorkflowConfigPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="audit" element={<PermissionRoute requiredAny={FEATURE_ACCESS.auditTrail.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <AuditTrailPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="preferences/notifications" element={<PermissionRoute requiredAny={FEATURE_ACCESS.notificationPreferences.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <NotificationPreferencesPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="templates" element={<PermissionRoute requiredAny={FEATURE_ACCESS.templates.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <TemplatesHubPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="inspections/templates" element={<Navigate to="/templates" replace/>}/>
          <Route path="inspections/submissions" element={<PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsSubmissions.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <InspectionSubmissionsPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="inspections/submissions/:submissionId" element={<PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsSubmissions.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <InspectionSubmissionDetailPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="inspections/requests" element={<PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsRequests.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <InspectionRequestsPage />
                </Suspense>
              </PermissionRoute>}/>
          <Route path="inspections/reports" element={<PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsReports.anyOf}>
                <Suspense fallback={LazyPageFallback}>
                  <InspectionReportsPage />
                </Suspense>
              </PermissionRoute>}/>
        </Route>

        <Route path="*" element={<Navigate to="/projects" replace/>}/>
      </Routes>
    </Router>);
}
export default App;
