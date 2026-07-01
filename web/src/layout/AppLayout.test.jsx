import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { AppLayout } from './AppLayout';
import { renderWithAuth } from '../test/testUtils';
const renderLayout = (permissions) => {
    renderWithAuth(<Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<div>Page Body</div>}/>
      </Route>
    </Routes>, {
        auth: {
            permissions,
        },
        initialEntries: ['/'],
    });
};
const renderLayoutWithAuth = (auth) => {
    renderWithAuth(<Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<div>Page Body</div>}/>
      </Route>
    </Routes>, {
        auth,
        initialEntries: ['/'],
    });
};
describe('AppLayout navigation visibility', () => {
    it('shows advanced links inside the workspace tools group', () => {
        renderLayout(['projects.view', 'closeout.templates.view']);
        expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Templates').length).toBeGreaterThan(0);
        expect(screen.getAllByText('More Tools').length).toBeGreaterThan(0);
        expect(screen.queryByText('Drawing Work')).toBeNull();
        expect(screen.queryByText('Dashboard')).toBeNull();
    });
    it('shows board tab when kanban permission exists', () => {
        renderLayout(['projects.view', 'kanban.view']);
        expect(screen.getAllByText('Drawing Work').length).toBeGreaterThan(0);
    });
    it('forces advanced mode when simple-first feature flag is disabled', () => {
        renderLayoutWithAuth({
            permissions: ['projects.view'],
            activeOrganization: {
                id: 1,
                name: 'Org',
                code: 'ORG',
                feature_flags: {
                    'ui.simple_first_v1': false,
                },
            },
        });
        expect(screen.queryByText('Use Advanced')).toBeNull();
        expect(screen.getAllByText('Simple-first rollout is disabled for this organization.').length).toBeGreaterThan(0);
    });
    it('hides admin/setup links for non-admin roles', () => {
        renderLayoutWithAuth({
            permissions: ['projects.view', 'ops.health.view', 'automation.view', 'projects.manage'],
            activeRoleNames: ['contractor'],
            activeOrganization: {
                id: 1,
                name: 'Org',
                code: 'ORG',
                roles: ['contractor'],
                feature_flags: {
                    'ui.simple_first_v1': false,
                },
            },
        });
        expect(screen.queryByText('Admin & Setup')).toBeNull();
        expect(screen.queryByText('Ops')).toBeNull();
        expect(screen.queryByText('Access')).toBeNull();
    });
    it('shows admin/setup section for owner role', () => {
        renderLayoutWithAuth({
            permissions: ['projects.view', 'ops.health.view'],
            activeRoleNames: ['owner'],
            activeOrganization: {
                id: 1,
                name: 'Org',
                code: 'ORG',
                roles: ['owner'],
                feature_flags: {
                    'ui.simple_first_v1': false,
                },
            },
        });
        expect(screen.getAllByText('Admin & Setup').length).toBeGreaterThan(0);
    });
});
