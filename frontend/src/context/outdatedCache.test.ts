import { describe, expect, it } from 'vitest'
import { applyFetchOutcome, initialOutdatedState, type OutdatedState } from './outdatedCache'
import type { OutdatedPackage } from '../lib/api'

function pkg(overrides: Partial<OutdatedPackage> = {}): OutdatedPackage {
  return {
    name: 'ffmpeg',
    isCask: false,
    installedVersion: '9.0.1',
    latestVersion: '9.0.1_1',
    pinned: false,
    ...overrides,
  } as OutdatedPackage
}

describe('applyFetchOutcome', () => {
  it('initial load success populates the cache and clears loading', () => {
    const items = [pkg()]
    const next = applyFetchOutcome(initialOutdatedState, { ok: true, items })

    expect(next).toEqual({ items, loading: false, error: null })
  })

  it('initial load failure surfaces a visible error (nothing to fall back to)', () => {
    const next = applyFetchOutcome(initialOutdatedState, { ok: false, error: 'brew not found' })

    expect(next).toEqual({ items: null, loading: false, error: 'brew not found' })
  })

  it('a background poll success updates the data', () => {
    const stale: OutdatedState = { items: [pkg({ name: 'a' })], loading: false, error: null }
    const fresh = [pkg({ name: 'a' }), pkg({ name: 'b' })]

    const next = applyFetchOutcome(stale, { ok: true, items: fresh })

    expect(next).toEqual({ items: fresh, loading: false, error: null })
  })

  it('a background poll failure does not clear or replace previously-good data', () => {
    const good: OutdatedState = { items: [pkg()], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    expect(next.items).toEqual(good.items)
    expect(next.error).toBeNull()
  })

  it('a poll failure that races ahead of the initial load resolving still clears the loading flag', () => {
    const next = applyFetchOutcome({ items: null, loading: true, error: null }, { ok: false, error: 'boom' })

    expect(next.loading).toBe(false)
  })

  it('subsequent failures after good data keep returning the same object reference when already settled', () => {
    const good: OutdatedState = { items: [pkg()], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    expect(next).toBe(good)
  })
})
