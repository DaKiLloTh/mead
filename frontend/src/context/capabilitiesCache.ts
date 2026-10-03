// Framework-independent decision logic for CapabilitiesSignal, extracted so
// the "what do we show before the real answer comes back" behavior can be
// unit tested without rendering Preact or mocking the Wails bridge.
//
// Unlike SystemInfoContext/InstalledPackagesContext, this cache is fetched
// exactly once (api.capabilities() answers with a fixed value for the life
// of the process -- a platform doesn't gain or lose Gatekeeper mid-session)
// and never polled or explicitly refreshed. The one thing worth getting
// right and testing directly is what nav items and gated views assume while
// that single fetch is still in flight: defaultCapabilities is deliberately
// the same "everything available" shape macOS has always had, so a fresh
// launch on the platform mead has actually shipped on so far never flashes
// a nav item and then hides it. On Linux the flash runs the other way (a
// beat where an App-Store/Adopt nav item that's about to disappear is still
// visible) -- an acceptable, brief cosmetic cost for a first Linux build,
// not a functional one, since nothing renders inside those views until the
// real capabilities land.

import type { Capabilities } from '../lib/api'

export interface CapabilitiesState {
  caps: Capabilities | null
  loading: boolean
  error: string | null
}

/** Matches this platform's actual behavior before this capability layer existed: everything on. */
export const defaultCapabilities: Capabilities = {
  hasGatekeeper: true,
  hasAppStore: true,
  hasTimeMachine: true,
  hasTouchID: true,
  hasAppAdoption: true,
  hasFloatingTitleBar: true,
  hasCmdModifierKey: true,
}

export const initialCapabilitiesState: CapabilitiesState = {
  caps: null,
  loading: true,
  error: null,
}

export type FetchOutcome = { ok: true; caps: Capabilities } | { ok: false; error: string }

/**
 * Pure reducer: given the current cache state and the outcome of the
 * single fetch, returns the next state.
 *
 * - success: replace `caps`, clear any error, loading -> false.
 * - failure: keep `caps` as null (so callers fall back to
 *   defaultCapabilities) but surface the error for logging, loading -> false.
 *   There's no "already had good data" branch to preserve here the way
 *   SystemInfoContext has, since this is a one-shot fetch rather than a
 *   repeating poll.
 */
export function applyFetchOutcome(state: CapabilitiesState, outcome: FetchOutcome): CapabilitiesState {
  if (outcome.ok) {
    return { caps: outcome.caps, loading: false, error: null }
  }
  return { caps: null, loading: false, error: outcome.error }
}

/** What call sites should treat as "current capabilities": the real value once loaded, the permissive default until then. */
export function resolveCapabilities(state: CapabilitiesState): Capabilities {
  return state.caps ?? defaultCapabilities
}
