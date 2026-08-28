import { describe, expect, it } from 'vitest'
import { applyFetchOutcome, initialAppStoreState, needsLoad, type AppStoreState } from './appStoreCache'
import type { MasApp } from '../lib/api'

function app(overrides: Partial<MasApp> = {}): MasApp {
  return {
    id: '409183694',
    name: 'Keynote',
    installedVersion: '14.5',
    latestVersion: '14.5',
    outdated: false,
    ...overrides,
  } as MasApp
}

describe('applyFetchOutcome', () => {
  it('initial load success (mas available) populates the cache and clears loading', () => {
    const apps = [app()]
    const outdated: MasApp[] = []
    const next = applyFetchOutcome(initialAppStoreState, { ok: true, available: true, apps, outdated })

    expect(next).toEqual({ available: true, apps, outdated, loading: false, error: null })
  })

  it('initial load success (mas not installed) records unavailable with empty lists', () => {
    const next = applyFetchOutcome(initialAppStoreState, { ok: true, available: false })

    expect(next).toEqual({ available: false, apps: [], outdated: [], loading: false, error: null })
  })

  it('initial load failure surfaces a visible error (nothing to fall back to)', () => {
    const next = applyFetchOutcome(initialAppStoreState, { ok: false, error: 'mas not found' })

    expect(next).toEqual({ available: null, apps: [], outdated: [], loading: false, error: 'mas not found' })
  })

  it('a refresh success updates the apps and outdated lists', () => {
    const stale: AppStoreState = {
      available: true,
      apps: [app({ name: 'a' })],
      outdated: [],
      loading: false,
      error: null,
    }
    const fresh = [app({ name: 'a' }), app({ name: 'b' })]

    const next = applyFetchOutcome(stale, { ok: true, available: true, apps: fresh, outdated: [] })

    expect(next).toEqual({ available: true, apps: fresh, outdated: [], loading: false, error: null })
  })

  it('a refresh failure does not clear or replace previously-good data', () => {
    const good: AppStoreState = { available: true, apps: [app()], outdated: [], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'mas: network hiccup' })

    expect(next.apps).toEqual(good.apps)
    expect(next.available).toBe(true)
    expect(next.error).toBeNull()
  })

  it('a refresh failure after learning mas is unavailable does not turn that into a visible error either', () => {
    const unavailable: AppStoreState = { available: false, apps: [], outdated: [], loading: false, error: null }

    const next = applyFetchOutcome(unavailable, { ok: false, error: 'boom' })

    expect(next.available).toBe(false)
    expect(next.error).toBeNull()
  })

  it('a failure that races ahead of the initial load resolving still clears the loading flag', () => {
    const next = applyFetchOutcome(initialAppStoreState, { ok: false, error: 'boom' })

    expect(next.loading).toBe(false)
  })

  it('subsequent failures after good data keep returning the same object reference when already settled', () => {
    const good: AppStoreState = { available: true, apps: [app()], outdated: [], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'mas: network hiccup' })

    expect(next).toBe(good)
  })
})

describe('needsLoad', () => {
  it('is true for the untouched initial state', () => {
    expect(needsLoad(initialAppStoreState)).toBe(true)
  })

  it('is true when the initial load errored (availability still unknown)', () => {
    const errored: AppStoreState = { available: null, apps: [], outdated: [], loading: false, error: 'boom' }
    expect(needsLoad(errored)).toBe(true)
  })

  it('is true when mas was last found unavailable -- must keep retrying, not cache that forever', () => {
    const unavailable: AppStoreState = { available: false, apps: [], outdated: [], loading: false, error: null }
    expect(needsLoad(unavailable)).toBe(true)
  })

  it('is false once a real apps list has been fetched -- settled, no repeat fetch on every hover/mount', () => {
    const good: AppStoreState = { available: true, apps: [app()], outdated: [], loading: false, error: null }
    expect(needsLoad(good)).toBe(false)
  })

  it('is still false for an available:true state with an empty apps list (mas installed, zero apps)', () => {
    const emptyButAvailable: AppStoreState = { available: true, apps: [], outdated: [], loading: false, error: null }
    expect(needsLoad(emptyButAvailable)).toBe(false)
  })
})
