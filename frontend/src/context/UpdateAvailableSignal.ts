import { signal } from '@preact/signals'
import { api } from '../lib/api'
import { applyUpdateCheckOutcome, initialUpdateAvailableState, type UpdateAvailableState } from './updateAvailableCache'

// Frequent enough that a `brew upgrade --cask mead` run while the app is
// open is noticed well within a session, cheap enough not to matter -- this
// is a local os.Executable()/plutil check (see internal/app/selfupdate.go),
// not a network call. Matches the other *Signal caches' own 60s interval
// for consistency rather than any requirement specific to this one.
const POLL_INTERVAL_MS = 60_000

/**
 * Shared cache for whether mead's own on-disk bundle no longer matches the
 * version running in this process (`api.updateAvailable()`), checked once
 * at app start and kept fresh by a background poll. See
 * updateAvailableCache.ts for the decision logic: once a restart has been
 * offered, this never reverts back to "nothing to report".
 *
 * Deliberately not wired into the app's shared refreshToken/bump() signal
 * the way installed-packages/system-info/outdated are -- nothing the user
 * does inside mead ever changes its own on-disk version, only an external
 * `brew upgrade --cask mead` does, so there is nothing for an in-app action
 * to usefully trigger an extra check for.
 */
export const updateAvailableSignal = signal<UpdateAvailableState>(initialUpdateAvailableState)

export function checkUpdateAvailable() {
  api
    .updateAvailable()
    .then((version) => {
      updateAvailableSignal.value = applyUpdateCheckOutcome(updateAvailableSignal.value, { ok: true, version })
    })
    .catch((e) => {
      // Logged, not surfaced -- see updateAvailableCache.ts, a failed check
      // is never visible to the user, there's simply nothing new to report
      // until the next poll succeeds.
      console.error('Failed to check for a mead update:', e)
      updateAvailableSignal.value = applyUpdateCheckOutcome(updateAvailableSignal.value, { ok: false })
    })
}

/**
 * Starts the initial check plus the background poll. Called once from
 * App.tsx at startup, matching startSystemInfoPolling/
 * startInstalledPackagesPolling's own "already started" guard (reference
 * equality against the untouched initial state object).
 */
export function startUpdateAvailablePolling() {
  if (updateAvailableSignal.value !== initialUpdateAvailableState) return
  checkUpdateAvailable()
  setInterval(checkUpdateAvailable, POLL_INTERVAL_MS)
}

export function useUpdateAvailable() {
  return updateAvailableSignal.value
}
