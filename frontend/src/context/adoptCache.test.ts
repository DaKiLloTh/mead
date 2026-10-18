import { describe, expect, it } from 'vitest'
import { applyScanOutcome, initialAdoptState, removeCandidate, startScan, type AdoptState } from './adoptCache'
import type { AdoptCandidate } from '../lib/api'

function candidate(overrides: Partial<AdoptCandidate> = {}): AdoptCandidate {
  return {
    appName: 'Firefox',
    appPath: '/Applications/Firefox.app',
    caskToken: 'firefox',
    ...overrides,
  } as AdoptCandidate
}

describe('startScan', () => {
  it('marks a first scan as running', () => {
    expect(startScan(initialAdoptState)).toEqual({ items: null, scanning: true, error: null })
  })

  it('keeps previous results and clears the last error on rescan', () => {
    const items = [candidate()]
    const state: AdoptState = { items, scanning: false, error: 'boom' }

    expect(startScan(state)).toEqual({ items, scanning: true, error: null })
  })
})

describe('applyScanOutcome', () => {
  it('a successful scan stores the results', () => {
    const items = [candidate()]
    const next = applyScanOutcome(startScan(initialAdoptState), { ok: true, items })

    expect(next).toEqual({ items, scanning: false, error: null })
  })

  it('a rescan replaces the previous results', () => {
    const fresh = [candidate({ caskToken: 'slack', appName: 'Slack' })]
    const state: AdoptState = { items: [candidate()], scanning: true, error: null }

    expect(applyScanOutcome(state, { ok: true, items: fresh }).items).toBe(fresh)
  })

  it('a failed first scan surfaces the error', () => {
    const next = applyScanOutcome(startScan(initialAdoptState), { ok: false, error: 'brew not found' })

    expect(next).toEqual({ items: null, scanning: false, error: 'brew not found' })
  })

  it('a failed rescan surfaces the error and keeps the previous results', () => {
    const items = [candidate()]
    const next = applyScanOutcome({ items, scanning: true, error: null }, { ok: false, error: 'timeout' })

    expect(next).toEqual({ items, scanning: false, error: 'timeout' })
  })
})

describe('removeCandidate', () => {
  it('drops the adopted cask and keeps the rest', () => {
    const slack = candidate({ caskToken: 'slack', appName: 'Slack' })
    const state: AdoptState = { items: [candidate(), slack], scanning: false, error: null }

    expect(removeCandidate(state, 'firefox').items).toEqual([slack])
  })

  it('is a no-op before any scan', () => {
    expect(removeCandidate(initialAdoptState, 'firefox')).toBe(initialAdoptState)
  })
})
