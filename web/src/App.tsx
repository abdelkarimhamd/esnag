import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDashboardPage } from './pages/ProjectDashboardPage'
import { DrawingViewerPage } from './pages/DrawingViewerPage'
import { KanbanBoardPage } from './pages/KanbanBoardPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExportCenterPage } from './pages/ExportCenterPage'
import { InspectionReportsPage } from './pages/InspectionReportsPage'
import { InspectionRequestsPage } from './pages/InspectionRequestsPage'
import { InspectionSubmissionDetailPage } from './pages/InspectionSubmissionDetailPage'
import { InspectionSubmissionsPage } from './pages/InspectionSubmissionsPage'
import { TemplatesHubPage } from './pages/TemplatesHubPage'
import { EquipmentPage } from './pages/EquipmentPage'
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage'
import { AccessControlPage } from './pages/AccessControlPage'
import { WorkflowAutomationPage } from './pages/WorkflowAutomationPage'
import { OpsAdminPage } from './pages/OpsAdminPage'
import { AppLayout } from './layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PermissionRoute } from './components/PermissionRoute'
import { DefaultLandingRedirect } from './components/DefaultLandingRedirect'
import { FEATURE_ACCESS } from './utils/permissions'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DefaultLandingRedirect />} />
          <Route
            path="projects"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.projects.anyOf}>
                <ProjectsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.projectDashboard.anyOf}>
                <ProjectDashboardPage />
              </PermissionRoute>
            }
          />
          <Route
            path="projects/:projectId/drawings/:drawingId"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.drawingViewer.anyOf}>
                <DrawingViewerPage />
              </PermissionRoute>
            }
          />
          <Route
            path="board"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.board.anyOf}>
                <KanbanBoardPage />
              </PermissionRoute>
            }
          />
          <Route
            path="dashboard"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.dashboard.anyOf}>
                <DashboardPage />
              </PermissionRoute>
            }
          />
          <Route
            path="exports"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.exports.anyOf}>
                <ExportCenterPage />
              </PermissionRoute>
            }
          />
          <Route
            path="equipment"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.equipment.anyOf}>
                <EquipmentPage />
              </PermissionRoute>
            }
          />
          <Route
            path="access-control"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.accessControl.anyOf}>
                <AccessControlPage />
              </PermissionRoute>
            }
          />
          <Route
            path="automation"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.automation.anyOf}>
                <WorkflowAutomationPage />
              </PermissionRoute>
            }
          />
          <Route
            path="ops"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.ops.anyOf}>
                <OpsAdminPage />
              </PermissionRoute>
            }
          />
          <Route
            path="preferences/notifications"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.notificationPreferences.anyOf}>
                <NotificationPreferencesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="templates"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.templates.anyOf}>
                <TemplatesHubPage />
              </PermissionRoute>
            }
          />
          <Route path="inspections/templates" element={<Navigate to="/templates" replace />} />
          <Route
            path="inspections/submissions"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsSubmissions.anyOf}>
                <InspectionSubmissionsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="inspections/submissions/:submissionId"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsSubmissions.anyOf}>
                <InspectionSubmissionDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="inspections/requests"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsRequests.anyOf}>
                <InspectionRequestsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="inspections/reports"
            element={
              <PermissionRoute requiredAny={FEATURE_ACCESS.inspectionsReports.anyOf}>
                <InspectionReportsPage />
              </PermissionRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Router>
  )
}

export default App

