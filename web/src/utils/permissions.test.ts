import { describe, expect, it } from 'vitest'
import { canAccessFeature, hasAnyPermission } from './permissions'

describe('permissions utils', () => {
  it('hasAnyPermission returns true when at least one permission matches', () => {
    expect(hasAnyPermission(['projects.view', 'snags.assign'], ['dashboard.view', 'snags.assign'])).toBe(true)
  })

  it('hasAnyPermission returns false when none match', () => {
    expect(hasAnyPermission(['projects.view'], ['dashboard.view', 'kanban.view'])).toBe(false)
  })

  it('canAccessFeature uses shared feature mapping', () => {
    expect(canAccessFeature(['closeout.templates.view'], 'templates')).toBe(true)
    expect(canAccessFeature(['projects.view'], 'templates')).toBe(true)
    expect(canAccessFeature(['dashboard.view'], 'templates')).toBe(false)
  })
})
