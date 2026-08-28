import { signal } from '@preact/signals'
import { api } from '../lib/api'
import { applyFetchOutcome, initialSystemInfoState, type SystemInfoState } from './systemInfoCache'

// Matches InstalledPackagesSignal's poll interval for the same reasoning:
// infrequent enough not to spam brew, frequent enough that external changes
// show up within about a minute without the user needing to do anything.
const POLL_INTERVAL_MS = 60_000

/**
 * Shared cache for system info (`api.getSystemInfo()`), fetched once at app
 * start and kept fresh by a background poll plus an explicit `refresh()`
 * that call sites invoke after they change system state. Dashboard is the
 * only current consumer, but the cache lives at module scope rather than in
 * Dashboard itself so navigating away and back doesn't reset to a loading
 * spinner (see issue #76).
 *
 * See InstalledPackagesSignal.ts for why this is a plain module-level signal
 * rather than a Context/Provider.
 *
 * A failed background poll never clears or masks previously-good data, see
 * systemInfoCache.ts for the decision logic and why. Only the initial load
 * surfaces a real `error`.
 */
export const systemInfoSignal = signal<SystemInfoState>(initialSystemInfoState)

export function refreshSystemInfo() {
  api
    .getSystemInfo()
    .then((info) => {
      systemInfoSignal.value = applyFetchOutcome(systemInfoSignal.value, { ok: true, info })
    })
    .catch((e) => {
      // Log so a silently-swallowed background poll failure is still
      // visible for debugging, without surfacing a user-facing error for
      // what's meant to be an invisible refresh (applyFetchOutcome only
      // turns this into a visible `error` if there's no good cache yet).
      console.error('Failed to refresh system info:', e)
      systemInfoSignal.value = applyFetchOutcome(systemInfoSignal.value, { ok: false, error: String(e) })
    })
}

/**
 * Starts the initial fetch plus the 60s background poll. Called once from
 * App.tsx at startup. "Already started" is read directly off the signal
 * (reference equality against the untouched initialSystemInfoState object)
 * rather than a separate `let pollingStarted` module boolean -- see
 * InstalledPackagesSignal.ts's startInstalledPackagesPolling for why.
 */
export function startSystemInfoPolling() {
  if (systemInfoSignal.value !== initialSystemInfoState) return
  refreshSystemInfo()
  setInterval(refreshSystemInfo, POLL_INTERVAL_MS)
}

/** Thin wrapper matching the old Context-based hook's exact shape, so call sites didn't need to change. */
export function useSystemInfo() {
  const state = systemInfoSignal.value
  return { ...state, refresh: refreshSystemInfo }
}
