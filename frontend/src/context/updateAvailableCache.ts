// Framework-independent decision logic for UpdateAvailableSignal, extracted
// so "what happens to the cache when a poll resolves" can be unit tested
// without rendering Preact or mocking timers -- mirrors
// systemInfoCache.ts/installedPackagesCache.ts's own split for the same
// reason.
//
// Unlike those caches there is no "real data vs. not loaded yet" initial
// state to worry about: api.updateAvailable() returns "" for "nothing to
// report" just as readily as it does for "no update", so there's nothing to
// show as loading and nothing that would ever look like an error to the
// user. The one rule worth getting right here is different: once a restart
// banner has been shown, it must never disappear on its own -- a later poll
// that happens to fail, or that (implausibly) reports back "" again, must
// never make an already-surfaced restart offer vanish out from under the
// user. The banner only ever goes away because the user restarted.

export interface UpdateAvailableState {
  /** The on-disk version to restart into, or null if no update has been detected. */
  version: string | null
}

export const initialUpdateAvailableState: UpdateAvailableState = { version: null }

export type UpdateCheckOutcome = { ok: true; version: string } | { ok: false }

/**
 * Pure reducer: given the current state and the outcome of a poll (the
 * initial check or a later background tick), returns the next state.
 *
 * - success with a non-empty version: record it. Once set, later outcomes
 *   (success with "", or a failure) never clear it back to null -- see the
 *   module doc for why.
 * - success with "" while nothing has been detected yet: still nothing to
 *   report.
 * - failure: logged by the caller, left out of the returned state entirely,
 *   same as the other *Signal caches' background-poll-failure handling.
 */
export function applyUpdateCheckOutcome(
  state: UpdateAvailableState,
  outcome: UpdateCheckOutcome
): UpdateAvailableState {
  if (state.version !== null) return state
  if (!outcome.ok) return state
  return outcome.version === '' ? state : { version: outcome.version }
}
