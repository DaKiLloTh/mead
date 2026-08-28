// Framework-independent decision logic for AppStoreSignal, extracted so the
// "what happens to the cache when a fetch resolves" behavior can be unit
// tested without rendering a component or mocking timers.
//
// Mirrors outdatedCache.ts/systemInfoCache.ts/installedPackagesCache.ts: a
// failure should only ever surface as a user-visible error when there is no
// previously-good cache to fall back on. Once we know whether mas is
// available and have a real apps list, a later failed fetch (a post-action
// reload, or the Refresh button racing a real mas hiccup) must never wipe
// that out or replace the view with an error -- it should be logged by the
// caller and retried next time, leaving the last-known-good list on screen.
//
// This fixes a real regression: AppStore.tsx's render only shows the apps
// table when `!loading && !error`, so before this reducer existed, a single
// transient `mas list`/`mas outdated` failure (mas talks to Apple's App
// Store servers, and is known to be occasionally flaky) replaced a fully
// working table with just an error card, even though good data was already
// on screen a moment earlier.

import type { MasApp } from '../lib/api'

export interface AppStoreState {
  available: boolean | null
  apps: MasApp[]
  outdated: MasApp[]
  loading: boolean
  error: string | null
}

export const initialAppStoreState: AppStoreState = {
  available: null,
  apps: [],
  outdated: [],
  loading: true,
  error: null,
}

export type FetchOutcome =
  | { ok: true; available: false }
  | { ok: true; available: true; apps: MasApp[]; outdated: MasApp[] }
  | { ok: false; error: string }

/**
 * Pure reducer: given the current cache state and the outcome of a fetch
 * (initial load, hover-prefetch, explicit refresh, or a post-action
 * reload), returns the next state.
 *
 * - success (mas unavailable): replace with available:false, clear apps/
 *   outdated/error, loading -> false.
 * - success (mas available): always replace apps/outdated, clear any
 *   error, loading -> false.
 * - failure while we don't know availability yet (`available === null`,
 *   i.e. this was the initial load): surface the error, loading -> false.
 * - failure while we already know availability: keep serving the existing
 *   apps/outdated/available unchanged (aside from clearing the loading
 *   flag if still set) -- the failure is not reflected in the returned
 *   state at all, so the caller should log it separately rather than
 *   expect this function to surface it.
 */
export function applyFetchOutcome(state: AppStoreState, outcome: FetchOutcome): AppStoreState {
  if (outcome.ok) {
    if (!outcome.available) {
      return { available: false, apps: [], outdated: [], loading: false, error: null }
    }
    return { available: true, apps: outcome.apps, outdated: outcome.outdated, loading: false, error: null }
  }
  if (state.available === null) {
    return { ...state, loading: false, error: outcome.error }
  }
  return state.loading ? { ...state, loading: false } : state
}

/**
 * Whether ensureAppStoreLoaded() should trigger a fresh fetch given the
 * current cached state: whenever availability is unknown (never checked,
 * or the initial check errored) or was last found unavailable.
 *
 * available:false is deliberately NOT treated as settled the way
 * available:true is. mas becoming available is something that can happen
 * entirely outside mead (the user runs `brew install mas` themselves in a
 * terminal, or mead's own earlier `ResolveMasPath` PATH-resolution bug is
 * what produced a false "not found" for this process even though mas was
 * genuinely installed the whole time) -- so a cached available:false must
 * not be permanently sticky for the life of the running process the way a
 * real, already-fetched apps list is. masAvailable() itself is a cheap
 * well-known-path/PATH check, not a real `mas` subprocess call like
 * masList/masOutdated, so re-checking it on every mount/hover doesn't
 * reintroduce the slow-refetch-on-every-visit problem this idempotent
 * loader pattern exists to avoid in the first place.
 */
export function needsLoad(state: AppStoreState): boolean {
  return state.available !== true
}
