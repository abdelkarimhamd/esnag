import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { PermissionRoute } from './PermissionRoute'
import { renderWithAuth } from '../test/testUtils'

describe('PermissionRoute', () => {
  it('renders children when user has any required permission', () => {
    renderWithAuth(
      <PermissionRoute requiredAny={['dashboard.view']}>
        <div>Dashboard Content</div>
      </PermissionRoute>,
      {
        auth: {
          permissions: ['projects.view', 'dashboard.view'],
        },
      },
    )

    expect(screen.getByText('Dashboard Content')).toBeTruthy()
  })

  it('renders forbidden fallback when user is missing required permissions', () => {
    renderWithAuth(
      <PermissionRoute requiredAny={['dashboard.view']}>
        <div>Dashboard Content</div>
      </PermissionRoute>,
      {
        auth: {
          permissions: ['projects.view'],
        },
      },
    )

    expect(screen.getByText('Access Restricted')).toBeTruthy()
    expect(screen.queryByText('Dashboard Content')).toBeNull()
  })
})
