import { describe, expect, it } from 'vitest'
import { applyFetchOutcome, initialSystemInfoState, type SystemInfoState } from './systemInfoCache'
import type { SystemInfo } from '../lib/api'

function info(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    brewVersion: '4.0.0',
    brewPath: '/opt/homebrew/bin/brew',
    prefix: '/opt/homebrew',
    installedFormulaCount: 10,
    installedCaskCount: 2,
    outdatedCount: 1,
    deprecatedCount: 0,
    disabledCount: 0,
    pinnedCount: 0,
    ...overrides,
  } as SystemInfo
}

describe('applyFetchOutcome', () => {
  it('initial load success populates the cache and clears loading', () => {
    const data = info()
    const next = applyFetchOutcome(initialSystemInfoState, { ok: true, info: data })

    expect(next).toEqual({ info: data, loading: false, error: null })
  })

  it('initial load failure surfaces a visible error (nothing to fall back to)', () => {
    const next = applyFetchOutcome(initialSystemInfoState, { ok: false, error: 'brew not found' })

    expect(next).toEqual({ info: null, loading: false, error: 'brew not found' })
  })

  it('a background poll success updates the data', () => {
    const stale: SystemInfoState = { info: info({ outdatedCount: 1 }), loading: false, error: null }
    const fresh = info({ outdatedCount: 3 })

    const next = applyFetchOutcome(stale, { ok: true, info: fresh })

    expect(next).toEqual({ info: fresh, loading: false, error: null })
  })

  it('a background poll failure does not clear or replace previously-good data', () => {
    const good: SystemInfoState = { info: info(), loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    // Same info, no error surfaced, the failure is invisible to the UI.
    expect(next.info).toEqual(good.info)
    expect(next.error).toBeNull()
  })

  it('a poll failure that races ahead of the initial load resolving still clears the loading flag', () => {
    // Defends against a state where `loading` gets stuck true forever if a
    // background-poll-shaped failure (info already null, loading still true)
    // is ever reached before the true initial-load failure path.
    const next = applyFetchOutcome({ info: null, loading: true, error: null }, { ok: false, error: 'boom' })

    expect(next.loading).toBe(false)
  })

  it('subsequent failures after good data keep returning the same object reference when already settled', () => {
    const good: SystemInfoState = { info: info(), loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    expect(next).toBe(good)
  })
})
