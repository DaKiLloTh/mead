import { describe, expect, it } from 'vitest'
import {
  applyFetchOutcome,
  defaultCapabilities,
  initialCapabilitiesState,
  resolveCapabilities,
  type CapabilitiesState,
} from './capabilitiesCache'
import type { Capabilities } from '../lib/api'

function linuxCaps(): Capabilities {
  return {
    hasGatekeeper: false,
    hasAppStore: false,
    hasTimeMachine: false,
    hasTouchID: false,
    hasAppAdoption: false,
    hasFloatingTitleBar: false,
  }
}

describe('applyFetchOutcome', () => {
  it('success populates the cache and clears loading', () => {
    const caps = linuxCaps()
    const next = applyFetchOutcome(initialCapabilitiesState, { ok: true, caps })

    expect(next).toEqual({ caps, loading: false, error: null })
  })

  it('failure surfaces the error and leaves caps null so callers fall back to the default', () => {
    const next = applyFetchOutcome(initialCapabilitiesState, { ok: false, error: 'bridge not ready' })

    expect(next).toEqual({ caps: null, loading: false, error: 'bridge not ready' })
  })

  it('a failure after a previous success still clears caps (one-shot fetch, no stale-data fallback)', () => {
    const good: CapabilitiesState = { caps: linuxCaps(), loading: false, error: null }

    const next = applyFetchOutcome(good, { ok: false, error: 'boom' })

    expect(next).toEqual({ caps: null, loading: false, error: 'boom' })
  })
})

describe('resolveCapabilities', () => {
  it('returns the permissive default while the fetch is still in flight', () => {
    expect(resolveCapabilities(initialCapabilitiesState)).toEqual(defaultCapabilities)
  })

  it('returns the permissive default if the fetch failed', () => {
    const failed: CapabilitiesState = { caps: null, loading: false, error: 'bridge not ready' }

    expect(resolveCapabilities(failed)).toEqual(defaultCapabilities)
  })

  it('returns the real, loaded capabilities once the fetch succeeds', () => {
    const caps = linuxCaps()
    const loaded: CapabilitiesState = { caps, loading: false, error: null }

    expect(resolveCapabilities(loaded)).toBe(caps)
  })
})
