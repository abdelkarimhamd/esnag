import type { ContextType, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocalizationProvider } from '../contexts/LocalizationContext'
import { AuthContext } from '../contexts/AuthContext'

type AuthContextValue = NonNullable<ContextType<typeof AuthContext>>

interface RenderWithAuthOptions {
  auth?: Partial<AuthContextValue>
  initialEntries?: string[]
}

const defaultAuthValue = (): AuthContextValue => ({
  loading: false,
  authenticated: true,
  user: { id: 1, name: 'Test User', email: 'test@example.com' },
  organizations: [
    {
      id: 1,
      name: 'Org',
      code: 'ORG',
      roles: ['project_manager'],
      permissions: ['projects.view'],
      project_permissions: [],
    },
  ],
  activeOrganization: {
    id: 1,
    name: 'Org',
    code: 'ORG',
    roles: ['project_manager'],
    permissions: ['projects.view'],
    project_permissions: [],
  },
  activeRoleNames: ['project_manager'],
  permissions: ['projects.view'],
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
  selectOrganization: () => {},
  resolveProjectPermissions: async () => ['projects.view'],
})

export const renderWithAuth = (ui: ReactNode, options?: RenderWithAuthOptions) => {
  const mergedAuth: AuthContextValue = {
    ...defaultAuthValue(),
    ...(options?.auth ?? {}),
  }

  return render(
    <MemoryRouter initialEntries={options?.initialEntries ?? ['/']}>
      <LocalizationProvider>
        <AuthContext.Provider value={mergedAuth}>{ui}</AuthContext.Provider>
      </LocalizationProvider>
    </MemoryRouter>,
  )
}
