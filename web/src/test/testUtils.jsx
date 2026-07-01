import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocalizationProvider } from '../contexts/LocalizationContext';
import { AuthContext } from '../contexts/AuthContext';
const defaultAuthValue = () => ({
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
    login: async () => { },
    logout: async () => { },
    refresh: async () => { },
    selectOrganization: () => { },
    resolveProjectPermissions: async () => ['projects.view'],
});
export const renderWithAuth = (ui, options) => {
    const mergedAuth = {
        ...defaultAuthValue(),
        ...(options?.auth ?? {}),
    };
    return render(<MemoryRouter initialEntries={options?.initialEntries ?? ['/']}>
      <LocalizationProvider>
        <AuthContext.Provider value={mergedAuth}>{ui}</AuthContext.Provider>
      </LocalizationProvider>
    </MemoryRouter>);
};
