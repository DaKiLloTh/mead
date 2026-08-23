import { describe, expect, it } from 'vitest'
import { relativeTimeFrom } from './relativeTime'

const NOW = new Date('2026-08-23T12:00:00Z')

describe('relativeTimeFrom', () => {
  it('returns unknown for an empty string', () => {
    expect(relativeTimeFrom('', NOW)).toEqual({ unit: 'unknown', count: 0 })
  })

  it('returns unknown for undefined', () => {
    expect(relativeTimeFrom(undefined, NOW)).toEqual({ unit: 'unknown', count: 0 })
  })

  it('returns unknown for an unparseable timestamp', () => {
    expect(relativeTimeFrom('not-a-date', NOW)).toEqual({ unit: 'unknown', count: 0 })
  })

  it('returns justNow for a timestamp under a minute ago', () => {
    expect(relativeTimeFrom('2026-08-23T11:59:30Z', NOW)).toEqual({ unit: 'justNow', count: 0 })
  })

  it('returns justNow for a timestamp in the future (clock skew)', () => {
    expect(relativeTimeFrom('2026-08-23T12:05:00Z', NOW)).toEqual({ unit: 'justNow', count: 0 })
  })

  it('returns minutes for a timestamp under an hour ago', () => {
    expect(relativeTimeFrom('2026-08-23T11:15:00Z', NOW)).toEqual({ unit: 'minutes', count: 45 })
  })

  it('returns hours for a timestamp under a day ago', () => {
    expect(relativeTimeFrom('2026-08-23T05:00:00Z', NOW)).toEqual({ unit: 'hours', count: 7 })
  })

  it('rounds hours down to the largest whole unit (90 minutes -> 1 hour)', () => {
    expect(relativeTimeFrom('2026-08-23T10:30:00Z', NOW)).toEqual({ unit: 'hours', count: 1 })
  })

  it('returns days for a timestamp a day or more ago', () => {
    expect(relativeTimeFrom('2026-08-20T12:00:00Z', NOW)).toEqual({ unit: 'days', count: 3 })
  })

  it('rounds days down to the largest whole unit (25 hours -> 1 day)', () => {
    expect(relativeTimeFrom('2026-08-22T11:00:00Z', NOW)).toEqual({ unit: 'days', count: 1 })
  })
})
