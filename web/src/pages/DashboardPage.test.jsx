import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { renderWithAuth } from '../test/testUtils';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../realtime/echo', () => ({
    subscribeOrganizationChannel: () => () => { },
}));

const mockKpis = {
    summary: { total_snags: 12, open_snags: 7, overdue_snags: 3, avg_closure_days: 4.2 },
    sla: {
        thresholds: { ack_hours: 24, fix_hours: 72, close_hours: 96 },
        averages: { ack_hours: 10, fix_hours: 20, close_hours: 30 },
        compliance: {
            ack_within_sla: 5,
            ack_measured: 6,
            ack_rate: 83,
            fix_within_sla: 4,
            fix_measured: 6,
            fix_rate: 67,
            close_within_sla: 3,
            close_measured: 6,
            close_rate: 50,
        },
    },
    root_cause_pareto: [],
    cost_impact: {
        summary: { estimated_cost_total: 1000, estimated_hours_total: 40 },
        by_trade: [],
        by_stakeholder: [],
    },
    forecast: { by_trade: [], by_stakeholder: [] },
    status_breakdown: { new: 3, assigned: 4 },
};

const mockCharts = {
    trend_14_days: [
        { date: '2026-02-10', created: 2, closed: 1 },
        { date: '2026-02-11', created: 3, closed: 2 },
    ],
};

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockImplementation((url) => {
            if (url === '/api/projects') {
                return Promise.resolve({ data: { data: [{ id: 1, code: 'P1', name: 'Project One' }] } });
            }
            if (url === '/api/root-cause-categories') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/dashboard/configs') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/dashboard/kpis') {
                return Promise.resolve({ data: { data: mockKpis } });
            }
            if (url === '/api/dashboard/charts') {
                return Promise.resolve({ data: { data: mockCharts } });
            }
            return Promise.resolve({ data: { data: [] } });
        });
    });

    it('defaults to simple mode and keeps advanced builder collapsed', async () => {
        renderWithAuth(<DashboardPage />, {
            auth: { permissions: ['projects.view', 'dashboard.view'] },
        });

        await waitFor(() => {
            expect(screen.getByText('Advanced analytics tools')).not.toBeNull();
        });

        expect(screen.getByText('Advanced analytics tools')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Show advanced' })).not.toBeNull();
        expect(screen.queryByText('Custom Dashboard Builder')).toBeNull();
        expect(screen.getByText('Total Snags')).not.toBeNull();
    });

    it('shows advanced builder after toggle', async () => {
        renderWithAuth(<DashboardPage />, {
            auth: { permissions: ['projects.view', 'dashboard.view'] },
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Show advanced' })).not.toBeNull();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Show advanced' }));

        await waitFor(() => {
            expect(screen.getByText('Custom Dashboard Builder')).not.toBeNull();
        });
    });

    it('shows recoverable error with hint and reloads when retry is clicked', async () => {
        let kpiFailureCount = 0;

        api.get.mockImplementation((url) => {
            if (url === '/api/projects') {
                return Promise.resolve({ data: { data: [{ id: 1, code: 'P1', name: 'Project One' }] } });
            }
            if (url === '/api/root-cause-categories') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/dashboard/configs') {
                return Promise.resolve({ data: { data: [] } });
            }
            if (url === '/api/dashboard/kpis') {
                if (kpiFailureCount < 2) {
                    kpiFailureCount += 1;

                    return Promise.reject({
                        response: {
                            status: 503,
                            data: {
                                message: 'Dashboard service unavailable.',
                                hint: 'Retry shortly.',
                                request_id: 'req-dashboard-1',
                            },
                        },
                    });
                }

                return Promise.resolve({ data: { data: mockKpis } });
            }
            if (url === '/api/dashboard/charts') {
                return Promise.resolve({ data: { data: mockCharts } });
            }
            return Promise.resolve({ data: { data: [] } });
        });

        renderWithAuth(<DashboardPage />, {
            auth: { permissions: ['projects.view', 'dashboard.view'] },
        });

        await waitFor(() => {
            expect(screen.getByText(/Dashboard service unavailable\./)).not.toBeNull();
        });
        expect(screen.getByText('Retry shortly.')).not.toBeNull();
        expect(screen.getByText(/Ref: req-dashboard-1/)).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => {
            expect(screen.getByText('Total Snags')).not.toBeNull();
        });
    });
});
