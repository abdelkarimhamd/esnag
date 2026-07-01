import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ProjectsPage } from './ProjectsPage';
import { renderWithAuth } from '../test/testUtils';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
    api: {
        get: vi.fn(),
    },
}));

describe('ProjectsPage resiliency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('shows recoverable API error with hint and retries successfully', async () => {
        let shouldFail = true;

        api.get.mockImplementation((url) => {
            if (url === '/api/projects') {
                if (shouldFail) {
                    shouldFail = false;

                    return Promise.reject({
                        response: {
                            status: 503,
                            data: {
                                message: 'Projects service unavailable.',
                                hint: 'Retry in a minute.',
                                request_id: 'req-projects-1',
                            },
                        },
                    });
                }

                return Promise.resolve({
                    data: {
                        data: [
                            {
                                id: 1,
                                code: 'P1',
                                name: 'Project One',
                                drawings_count: 2,
                                snags_count: 5,
                                status: 'active',
                                is_training: false,
                            },
                        ],
                    },
                });
            }

            return Promise.resolve({ data: { data: [] } });
        });

        renderWithAuth(<ProjectsPage />, {
            auth: { permissions: ['projects.view'] },
        });

        await waitFor(() => {
            expect(screen.getByText(/Projects service unavailable\./)).not.toBeNull();
        });
        expect(screen.getByText('Retry in a minute.')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => {
            expect(screen.getByText('Project One')).not.toBeNull();
        });
    });
});
