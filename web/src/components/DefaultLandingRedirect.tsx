import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { canAccessFeature, type FeatureAccessKey } from '../utils/permissions'

const landingPriority: Array<{ path: string; feature: FeatureAccessKey }> = [
  { path: '/projects', feature: 'projects' },
  { path: '/templates', feature: 'templates' },
  { path: '/board', feature: 'board' },
  { path: '/dashboard', feature: 'dashboard' },
  { path: '/exports', feature: 'exports' },
  { path: '/inspections/submissions', feature: 'inspectionsSubmissions' },
  { path: '/inspections/requests', feature: 'inspectionsRequests' },
  { path: '/inspections/reports', feature: 'inspectionsReports' },
  { path: '/equipment', feature: 'equipment' },
  { path: '/automation', feature: 'automation' },
  { path: '/access-control', feature: 'accessControl' },
  { path: '/ops', feature: 'ops' },
  { path: '/preferences/notifications', feature: 'notificationPreferences' },
]

export const DefaultLandingRedirect = () => {
  const { permissions } = useAuth()
  const destination = landingPriority.find((item) => canAccessFeature(permissions, item.feature))

  if (!destination) {
    return <ForbiddenPage message="No modules are currently assigned to your role in this organization." />
  }

  return <Navigate to={destination.path} replace />
}
