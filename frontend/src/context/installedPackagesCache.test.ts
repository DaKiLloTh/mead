import { describe, expect, it } from 'vitest'
import { applyFetchOutcome, initialInstalledPackagesState, type InstalledPackagesState } from './installedPackagesCache'
import type { BrewPackage } from '../lib/api'

function pkg(name: string): BrewPackage {
  return { name, isCask: false } as BrewPackage
}

describe('applyFetchOutcome', () => {
  it('initial load success populates the cache and clears loading', () => {
    const packages = [pkg('git'), pkg('wget')]
    const next = applyFetchOutcome(initialInstalledPackagesState, { ok: true, packages })

    expect(next).toEqual({ packages, loading: false, error: null })
  })

  it('initial load failure surfaces a visible error (nothing to fall back to)', () => {
    const next = applyFetchOutcome(initialInstalledPackagesState, { ok: false, error: 'brew not found' })

    expect(next).toEqual({ packages: null, loading: false, error: 'brew not found' })
  })

  it('a background poll success updates the data', () => {
    const stale: InstalledPackagesState = { packages: [pkg('git')], loading: false, error: null }
    const fresh = [pkg('git'), pkg('wget')]

    const next = applyFetchOutcome(stale, { ok: true, packages: fresh })

    expect(next).toEqual({ packages: fresh, loading: false, error: null })
  })

  it('a background poll failure does not clear or replace previously-good data', () => {
    const good: InstalledPackagesState = { packages: [pkg('git'), pkg('wget')], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    // Same packages, no error surfaced — the failure is invisible to the UI.
    expect(next.packages).toEqual(good.packages)
    expect(next.error).toBeNull()
  })

  it('a poll failure that races ahead of the initial load resolving still clears the loading flag', () => {
    // Defends against a state where `loading` gets stuck true forever if a
    // background-poll-shaped failure (packages already null, loading still
    // true) is ever reached before the true initial-load failure path.
    const next = applyFetchOutcome({ packages: null, loading: true, error: null }, { ok: false, error: 'boom' })

    expect(next.loading).toBe(false)
  })

  it('subsequent failures after good data keep returning the same object reference when already settled', () => {
    const good: InstalledPackagesState = { packages: [pkg('git')], loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'network hiccup' })

    expect(next).toBe(good)
  })
})
