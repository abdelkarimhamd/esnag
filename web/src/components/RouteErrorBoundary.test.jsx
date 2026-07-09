import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { renderWithAuth } from '../test/testUtils';

const ThrowOnRender = () => {
    throw new Error('Render failed in test');
};

describe('RouteErrorBoundary', () => {
    it('renders fallback UI when child route throws', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        renderWithAuth(<RouteErrorBoundary>
        <ThrowOnRender />
      </RouteErrorBoundary>);

        expect(screen.getByText('Something went wrong')).not.toBeNull();
        expect(screen.getByText('Render failed in test')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull();

        consoleSpy.mockRestore();
    });
});
