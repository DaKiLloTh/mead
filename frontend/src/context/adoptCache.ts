// Framework-independent state transitions for AdoptSignal, extracted so the
// scan cache's behavior can be unit tested without rendering Preact.
//
// Unlike outdatedCache.ts there's no background poll: a scan walks every app
// in /Applications against the cask index and takes a while, so it only runs
// when the user asks. The point of the cache is that its results outlive the
// Adopt view, so leaving the page and coming back doesn't throw them away.

import type { AdoptCandidate } from '../lib/api'

export interface AdoptState {
  items: AdoptCandidate[] | null
  scanning: boolean
  error: string | null
}

export const initialAdoptState: AdoptState = {
  items: null,
  scanning: false,
  error: null,
}

export type ScanOutcome = { ok: true; items: AdoptCandidate[] } | { ok: false; error: string }

/** A scan is starting: clear the last error, keep any previous results on hand. */
export function startScan(state: AdoptState): AdoptState {
  return { ...state, scanning: true, error: null }
}

/**
 * A scan finished. Success replaces the results. Failure surfaces the error
 * but keeps the previous results, since the user asked for this scan and
 * should see that it failed, while the last good list is still accurate
 * enough to act on.
 */
export function applyScanOutcome(state: AdoptState, outcome: ScanOutcome): AdoptState {
  if (outcome.ok) {
    return { items: outcome.items, scanning: false, error: null }
  }
  return { ...state, scanning: false, error: outcome.error }
}

/** Drops an adopted cask from the remembered results so the list doesn't go stale. */
export function removeCandidate(state: AdoptState, caskToken: string): AdoptState {
  if (state.items === null) return state
  return { ...state, items: state.items.filter((c) => c.caskToken !== caskToken) }
}
