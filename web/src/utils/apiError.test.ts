import { describe, expect, it } from 'vitest'
import { parseApiError } from './apiError'

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
    }

    expect(parseApiError(error, 'Fallback')).toBe('Field is required')
  })

  it('returns API message when no validation errors exist', () => {
    const error = {
      response: {
        data: {
          message: 'Forbidden action',
        },
      },
    }

    expect(parseApiError(error, 'Fallback')).toBe('Forbidden action')
  })

  it('falls back to provided message when payload is unknown', () => {
    expect(parseApiError(null, 'Fallback')).toBe('Fallback')
  })
})
