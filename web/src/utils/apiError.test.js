import { describe, expect, it } from 'vitest';
import { normalizeApiError, parseApiError } from './apiError';
describe('parseApiError', () => {
    it('returns first validation error when available', () => {
        const error = {
            response: {
                data: {
                    errors: {
                        field: ['Field is required'],
                    },
                },
            },
        };
        expect(parseApiError(error, 'Fallback')).toBe('Field is required');
    });
    it('returns API message when no validation errors exist', () => {
        const error = {
            response: {
                data: {
                    message: 'Forbidden action',
                },
            },
        };
        expect(parseApiError(error, 'Fallback')).toBe('Forbidden action');
    });
    it('falls back to provided message when payload is unknown', () => {
        expect(parseApiError(null, 'Fallback')).toBe('Fallback');
    });
    it('appends request reference when request id is available', () => {
        const error = {
            response: {
                headers: {
                    'x-request-id': 'req-123',
                },
                data: {
                    message: 'Something failed',
                },
            },
        };
        expect(parseApiError(error, 'Fallback')).toBe('Something failed (Ref: req-123)');
    });
    it('normalizes structured error payload', () => {
        const error = {
            response: {
                status: 422,
                data: {
                    message: 'Status transition blocked.',
                    errors: {
                        to_status: ['Invalid transition'],
                    },
                    request_id: 'req-456',
                },
            },
        };
        expect(normalizeApiError(error, 'Fallback')).toEqual({
            message: 'Invalid transition (Ref: req-456)',
            fieldErrors: {
                to_status: ['Invalid transition'],
            },
            requestId: 'req-456',
            status: 422,
            code: null,
            hint: null,
            action: null,
        });
    });
    it('reads code, hint and action from API envelope', () => {
        const error = {
            response: {
                status: 403,
                data: {
                    message: 'Forbidden action.',
                    code: 'forbidden',
                    hint: 'Request access.',
                    action: 'request_access',
                    request_id: 'req-789',
                },
            },
        };
        expect(normalizeApiError(error, 'Fallback')).toEqual({
            message: 'Forbidden action. (Ref: req-789)',
            fieldErrors: {},
            requestId: 'req-789',
            status: 403,
            code: 'forbidden',
            hint: 'Request access.',
            action: 'request_access',
        });
    });
});
