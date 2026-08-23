// Pure "how long ago" bucketing, kept separate from rendering/i18n so it's
// testable without mocking translations or the system clock beyond passing
// `now` in explicitly (see relativeTime.test.ts).
//
// Used for Dashboard's "last updated" indicator next to the Update Homebrew
// button (see issue #77): the backend sends a raw RFC3339 timestamp (or ""
// if it couldn't determine one), and this turns it into a relative bucket
// the component maps to a translated string. Keeping the bucketing here
// instead of baking display strings into it means it stays reusable and
// doesn't need an i18n instance to test.

export type RelativeTimeUnit = 'justNow' | 'minutes' | 'hours' | 'days' | 'unknown'

export interface RelativeTime {
  unit: RelativeTimeUnit
  count: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Turns an ISO/RFC3339 timestamp into a relative-time bucket as of `now`.
 *
 * - "" / undefined / an unparseable string -> 'unknown' (no data to show).
 * - a timestamp in the future (clock skew between machine and whatever set
 *   it) -> 'justNow' rather than a nonsensical negative count.
 * - otherwise: the largest whole unit under a minute/hour/day, e.g. 90
 *   minutes ago is reported as 1 hour, not 90 minutes.
 */
export function relativeTimeFrom(iso: string | undefined, now: Date): RelativeTime {
  if (!iso) return { unit: 'unknown', count: 0 }

  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return { unit: 'unknown', count: 0 }

  const diffMs = now.getTime() - then.getTime()
  if (diffMs < MINUTE_MS) return { unit: 'justNow', count: 0 }
  if (diffMs < HOUR_MS) return { unit: 'minutes', count: Math.floor(diffMs / MINUTE_MS) }
  if (diffMs < DAY_MS) return { unit: 'hours', count: Math.floor(diffMs / HOUR_MS) }
  return { unit: 'days', count: Math.floor(diffMs / DAY_MS) }
}
