import { describe, expect, it } from 'vitest'
import { applyUpdateCheckOutcome, initialUpdateAvailableState, type UpdateAvailableState } from './updateAvailableCache'

describe('applyUpdateCheckOutcome', () => {
  it('a successful check with no update reported stays at null', () => {
    const next = applyUpdateCheckOutcome(initialUpdateAvailableState, { ok: true, version: '' })

    expect(next).toEqual({ version: null })
  })

  it('a successful check reporting a new on-disk version records it', () => {
    const next = applyUpdateCheckOutcome(initialUpdateAvailableState, { ok: true, version: '0.12.0' })

    expect(next).toEqual({ version: '0.12.0' })
  })

  it('a failed check while nothing has been detected yet stays at null', () => {
    const next = applyUpdateCheckOutcome(initialUpdateAvailableState, { ok: false })

    expect(next).toEqual({ version: null })
  })

  it('once a version is detected, a later successful check reporting no update does not clear it', () => {
    const detected: UpdateAvailableState = { version: '0.12.0' }

    const next = applyUpdateCheckOutcome(detected, { ok: true, version: '' })

    expect(next).toEqual({ version: '0.12.0' })
  })

  it('once a version is detected, a later failed check does not clear it', () => {
    const detected: UpdateAvailableState = { version: '0.12.0' }

    const next = applyUpdateCheckOutcome(detected, { ok: false })

    expect(next).toEqual({ version: '0.12.0' })
  })

  it('once a version is detected, a later check reporting a different version does not override it', () => {
    // The banner only ever offers a restart into whatever was first
    // detected -- see the module doc. A second, different version showing
    // up mid-session (another `brew upgrade` before the user restarted)
    // is not expected in practice, but the same "never move once set" rule
    // still applies rather than silently swapping the version the button
    // will relaunch into.
    const detected: UpdateAvailableState = { version: '0.12.0' }

    const next = applyUpdateCheckOutcome(detected, { ok: true, version: '0.13.0' })

    expect(next).toEqual({ version: '0.12.0' })
  })

  it('returns the same object reference once a version is already settled', () => {
    const detected: UpdateAvailableState = { version: '0.12.0' }

    const next = applyUpdateCheckOutcome(detected, { ok: true, version: '' })

    expect(next).toBe(detected)
  })
})
