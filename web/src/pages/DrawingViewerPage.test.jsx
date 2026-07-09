import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { DrawingViewerPage } from './DrawingViewerPage';
import { renderWithAuth } from '../test/testUtils';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../hooks/useCoreTour', () => ({
    useCoreTour: () => { },
}));

vi.mock('../realtime/echo', () => ({
    subscribeOrganizationChannel: () => () => { },
}));

vi.mock('@mui/x-data-grid', () => ({
    DataGrid: () => <div data-testid="data-grid"/>,
}));

const projectPayload = {
    id: 1,
    code: 'P1',
    name: 'Project One',
    is_training: false,
    training_locked: false,
    drawings: [{ id: 10, code: 'D-10', title: 'Ground Plan' }],
    buildings: [
        {
            id: 5,
            name: 'Building A',
            floors: [
                {
                    id: 6,
                    name: 'Level 1',
                    locations: [{ id: 7, floor_id: 6, code: 'L-1', name: 'Room 101' }],
                },
            ],
        },
    ],
};

const drawingPayload = {
    id: 10,
    code: 'D-10',
    title: 'Ground Plan',
    building_id: 5,
    floor_id: 6,
    current_revision_id: 100,
    currentRevision: {
        id: 100,
        revision_label: 'R1',
        file_name: 'r1.png',
        mime_type: 'image/png',
    },
    revisions: [
        {
            id: 100,
            drawing_id: 10,
            revision_label: 'R1',
            file_name: 'r1.png',
            mime_type: 'image/png',
            is_current: true,
        },
        {
            id: 101,
            drawing_id: 10,
            revision_label: 'R2',
            file_name: 'r2.png',
            mime_type: 'image/png',
            is_current: false,
        },
    ],
};

describe('DrawingViewerPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockImplementation((url) => {
            if (url === '/api/projects/1') {
                return Promise.resolve({ data: { data: projectPayload } });
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
            if (url === '/api/root-cause-categories') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/drawings/10') {
                return Promise.resolve({ data: { data: drawingPayload } });
            }
            if (url === '/api/snags') {
                return Promise.resolve({ data: { data: [] } });
            }
            return Promise.resolve({ data: { data: [] } });
        });
    });

    it('shows guided steps and keeps advanced sections collapsed by default', async () => {
        renderWithAuth(<Routes>
        <Route path="/projects/:projectId/drawings/:drawingId" element={<DrawingViewerPage />}/>
      </Routes>, {
            initialEntries: ['/projects/1/drawings/10'],
            auth: {
                permissions: ['projects.view', 'drawings.view', 'snags.view', 'snags.create'],
                resolveProjectPermissions: async () => ['projects.view', 'drawings.view', 'snags.view', 'snags.create'],
            },
        });

        await waitFor(() => {
            expect(screen.getByText('Drawing Viewer')).not.toBeNull();
        });

        expect(screen.getByText('1. Select revision')).not.toBeNull();
        expect(screen.getByText('2. Place pin')).not.toBeNull();
        expect(screen.getByText('3. Create snag')).not.toBeNull();

        const advancedToolsToggle = screen.getByRole('button', { name: /Advanced Tools \(Compare, Migration, Barcode\)/ });
        const advancedBulkToggle = screen.getByRole('button', { name: /Advanced Snag Actions/ });
        expect(advancedToolsToggle.getAttribute('aria-expanded')).toBe('false');
        expect(advancedBulkToggle.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByText('Keep current')).toBeNull();
    });

    it('shows error with request hint and recovers on retry', async () => {
        let projectShouldFail = true;

        api.get.mockImplementation((url) => {
            if (url === '/api/projects/1') {
                if (projectShouldFail) {
                    projectShouldFail = false;

                    return Promise.reject({
                        response: {
                            status: 503,
                            data: {
                                message: 'Project data unavailable.',
                                hint: 'Retry after service recovery.',
                                request_id: 'req-drawing-1',
                            },
                        },
                    });
                }

                return Promise.resolve({ data: { data: projectPayload } });
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
            if (url === '/api/root-cause-categories') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/drawings/10') {
                return Promise.resolve({ data: { data: drawingPayload } });
            }
            if (url === '/api/snags') {
                return Promise.resolve({ data: { data: [] } });
            }
            return Promise.resolve({ data: { data: [] } });
        });

        renderWithAuth(<Routes>
        <Route path="/projects/:projectId/drawings/:drawingId" element={<DrawingViewerPage />}/>
      </Routes>, {
            initialEntries: ['/projects/1/drawings/10'],
            auth: {
                permissions: ['projects.view', 'drawings.view', 'snags.view', 'snags.create'],
                resolveProjectPermissions: async () => ['projects.view', 'drawings.view', 'snags.view', 'snags.create'],
            },
        });

        await waitFor(() => {
            expect(screen.getByText(/Project data unavailable\./)).not.toBeNull();
        });
        expect(screen.getByText('Retry after service recovery.')).not.toBeNull();
        expect(screen.getByText(/Ref: req-drawing-1/)).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => {
            expect(screen.getByText('Drawing Viewer')).not.toBeNull();
        });
    });
});
