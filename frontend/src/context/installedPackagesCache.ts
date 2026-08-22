// Framework-independent decision logic for InstalledPackagesContext, extracted
// so the "what happens to the cache when a fetch resolves" behavior can be
// unit tested without rendering React or mocking timers.
//
// Why this exists: the shared installed-packages cache is refreshed from three
// places — the initial load on app start, a background poll every
// POLL_INTERVAL_MS, and an explicit refresh() after the user does something
// that changes installed state (install/uninstall/pin/etc). All three funnel
// through the same "apply a fetch outcome to the current state" decision,
// and that decision has a rule worth getting right and testing directly:
// a failure should only ever surface as a user-visible error when there is
// no previously-good cache to fall back on. Once we have a good package
// list, a later failed fetch (background poll or otherwise) must never wipe
// it out or replace it with an error — it should be logged by the caller and
// retried next time, leaving the last-known-good data on screen.

import type { BrewPackage } from '../lib/api'

export interface InstalledPackagesState {
  packages: BrewPackage[] | null
  loading: boolean
  error: string | null
}

export const initialInstalledPackagesState: InstalledPackagesState = {
  packages: null,
  loading: true,
  error: null,
}

export type FetchOutcome = { ok: true; packages: BrewPackage[] } | { ok: false; error: string }

/**
 * Pure reducer: given the current cache state and the outcome of a fetch
 * (initial load, background poll, or explicit refresh), returns the next
 * state.
 *
 * - success: always replace `packages`, clear any error, loading -> false.
 * - failure while we have no good data yet (`packages === null`, i.e. this
 *   was the initial load): surface the error, loading -> false.
 * - failure while we already have good data: keep serving it unchanged
 *   (aside from clearing the initial `loading` flag if still set) — the
 *   failure is not reflected in the returned state at all, so the caller
 *   should log it separately rather than expect this function to surface it.
 */
export function applyFetchOutcome(
  state: InstalledPackagesState,
  outcome: FetchOutcome
): InstalledPackagesState {
  if (outcome.ok) {
    return { packages: outcome.packages, loading: false, error: null }
  }
  if (state.packages === null) {
    return { packages: null, loading: false, error: outcome.error }
  }
  return state.loading ? { ...state, loading: false } : state
}
