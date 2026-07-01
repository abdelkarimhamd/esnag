import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { DefaultLandingRedirect } from './DefaultLandingRedirect';
import { renderWithAuth } from '../test/testUtils';
describe('DefaultLandingRedirect', () => {
    it('redirects to first accessible route based on permissions', () => {
        renderWithAuth(<Routes>
        <Route path="/" element={<DefaultLandingRedirect />}/>
        <Route path="/templates" element={<div>Templates Home</div>}/>
      </Routes>, {
            auth: {
                permissions: ['closeout.templates.view'],
            },
            initialEntries: ['/'],
        });
        expect(screen.getByText('Templates Home')).toBeTruthy();
    });
});
