import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { KanbanBoardPage } from './KanbanBoardPage';
import { renderWithAuth } from '../test/testUtils';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

vi.mock('../components/SnagDrawer', () => ({
    SnagDrawer: () => null,
}));

vi.mock('../hooks/useFeatureTour', () => ({
    useFeatureTour: () => { },
}));

vi.mock('../realtime/echo', () => ({
    subscribeOrganizationChannel: () => () => { },
}));

describe('KanbanBoardPage resiliency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows recoverable API error and reloads board when retry is clicked', async () => {
        let boardShouldFail = true;

        api.get.mockImplementation((url) => {
            if (url === '/api/projects') {
                return Promise.resolve({
                    data: {
                        data: [{ id: 1, code: 'P1', name: 'Project One' }],
                    },
                });
            }

            if (url === '/api/organizations/members') {
                return Promise.resolve({ data: { data: [] } });
            }

            if (url === '/api/stakeholders/companies') {
                return Promise.resolve({ data: { data: [] } });
            }

            if (url === '/api/stakeholders/teams') {
                return Promise.resolve({ data: { data: [] } });
            }

            if (url === '/api/kanban/snags') {
                if (boardShouldFail) {
                    boardShouldFail = false;

                    return Promise.reject({
                        response: {
                            status: 503,
                            data: {
                                message: 'Board temporarily unavailable.',
                                hint: 'Retry in a moment.',
                                request_id: 'req-kanban-1',
                            },
                        },
                    });
                }

                return Promise.resolve({
                    data: {
                        data: {
                            columns: [],
                            workflow: {},
                            filters: {
                                scope: 'mine',
                                due_window: 'all',
                            },
                        },
                    },
                });
            }

            return Promise.resolve({ data: { data: [] } });
        });

        renderWithAuth(<KanbanBoardPage />, {
            auth: {
                permissions: ['projects.view', 'kanban.view'],
                resolveProjectPermissions: async () => ['projects.view', 'kanban.view'],
            },
        });

        await waitFor(() => {
            expect(screen.getByText(/Board temporarily unavailable\./)).not.toBeNull();
        });
        expect(screen.getByText('Retry in a moment.')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => {
            expect(screen.getByText('No snags for this filter')).not.toBeNull();
        });
    });
});
