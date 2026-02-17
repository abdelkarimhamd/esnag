import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import { AppLayout } from './AppLayout'
import { renderWithAuth } from '../test/testUtils'

const renderLayout = (permissions: string[]) => {
  renderWithAuth(
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<div>Page Body</div>} />
      </Route>
    </Routes>,
    {
      auth: {
        permissions,
      },
      initialEntries: ['/'],
    },
  )
}

describe('AppLayout navigation visibility', () => {
  it('shows templates tab for closeout template viewers and hides unrelated tabs', () => {
    renderLayout(['projects.view', 'closeout.templates.view'])

    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Templates').length).toBeGreaterThan(0)
    expect(screen.queryByText('Snags Board')).toBeNull()
    expect(screen.queryByText('Dashboard')).toBeNull()
  })

  it('shows board tab when kanban permission exists', () => {
    renderLayout(['projects.view', 'kanban.view'])

    expect(screen.getAllByText('Snags Board').length).toBeGreaterThan(0)
  })
})
