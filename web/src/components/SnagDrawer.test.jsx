import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SnagDrawer } from './SnagDrawer';
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

vi.mock('../hooks/useFeatureTour', () => ({
    useFeatureTour: () => { },
}));

const mockSnag = {
    id: 99,
    reference: 'SNG-00099',
    title: 'Test snag',
    description: 'Test description',
    status: 'in_progress',
    priority: 'high',
    assigned_to: null,
    assigned_company_id: null,
    assigned_team_id: null,
    assignee: null,
    comments: [],
    attachments: [],
    statusHistory: [],
    workflow: {
        current_status: 'in_progress',
        available_transitions: ['ready_for_review', 'rejected'],
        recommended_next_status: 'ready_for_review',
        can_close: false,
        closeout_completion: 0,
        blocked: {},
    },
};

describe('SnagDrawer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockImplementation((url) => {
            if (url === '/api/snags/99') {
                return Promise.resolve({ data: { data: mockSnag } });
            }
            return Promise.resolve({ data: { data: null } });
        });
    });

    it('renders simplified tabs and recommended next action', async () => {
        renderWithAuth(<SnagDrawer snagId={99} members={[]} companies={[]} teams={[]} canTransition canAssign canComment canAttach canCloseoutView={false} onClose={() => { }} onChanged={async () => { }}/>);

        await waitFor(() => {
            expect(screen.getByText('SNG-00099')).not.toBeNull();
        });

        expect(screen.getByRole('tab', { name: 'Summary' })).not.toBeNull();
        expect(screen.getByRole('tab', { name: 'Take Action' })).not.toBeNull();
        expect(screen.getByRole('tab', { name: 'Comments' })).not.toBeNull();
        expect(screen.getByRole('tab', { name: 'History' })).not.toBeNull();

        fireEvent.click(screen.getByRole('tab', { name: 'Take Action' }));

        await waitFor(() => {
            expect(screen.getByText('Recommended next step')).not.toBeNull();
        });
        expect(screen.getAllByText('Ready For Review').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Use Recommended' })).not.toBeNull();
    });
});
