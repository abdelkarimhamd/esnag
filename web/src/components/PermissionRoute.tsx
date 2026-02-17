import type { ReactElement } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { hasAnyPermission } from '../utils/permissions'

interface PermissionRouteProps {
  children: ReactElement
  requiredAny: string[]
}

export const PermissionRoute = ({ children, requiredAny }: PermissionRouteProps) => {
  const { permissions } = useAuth()

  if (!hasAnyPermission(permissions, requiredAny)) {
    return <ForbiddenPage />
  }

  return children
}
