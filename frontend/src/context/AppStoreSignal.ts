import { signal } from '@preact/signals'
import { api } from '../lib/api'
import { applyFetchOutcome, initialAppStoreState, type AppStoreState } from './appStoreCache'

export type { AppStoreState }

/**
 * Shared cache for the App Store view's data (mas availability, installed
 * apps, outdated apps), so the fetch can start before the view ever mounts
 * -- Sidebar fires ensureAppStoreLoaded() on hover. mas itself is the
 * slowest CLI this app shells out to, so getting a head start here matters
 * more than for most views. Not polled in the background, same reasoning
 * as ServicesSignal: only interesting while someone's looking at it.
 *
 * A failed load never clears or masks previously-good data, see
 * appStoreCache.ts for the decision logic and why -- mas talks to Apple's
 * App Store servers and is known to be occasionally flaky, so without this
 * a single transient `mas list`/`mas outdated` failure would replace a
 * fully working apps table with just an error card. Only the initial load
 * surfaces a real `error`.
 */
export const appStoreSignal = signal<AppStoreState>(initialAppStoreState)

/** Always performs a real fetch: the Refresh/"try again" button, and post-action reloads (install mas, upgrade an app). */
export function loadAppStore() {
  appStoreSignal.value = { ...appStoreSignal.value, loading: true, error: null }
  api
    .masAvailable()
    .then(async (ok) => {
      if (!ok) {
        appStoreSignal.value = applyFetchOutcome(appStoreSignal.value, { ok: true, available: false })
        return
      }
      const [apps, outdated] = await Promise.all([api.masList(), api.masOutdated()])
      appStoreSignal.value = applyFetchOutcome(appStoreSignal.value, { ok: true, available: true, apps, outdated })
    })
    .catch((e) => {
      // Log so a silently-swallowed background/refresh failure is still
      // visible for debugging, without surfacing a user-facing error for
      // what should be an invisible retry-next-time (applyFetchOutcome
      // only turns this into a visible `error` if there's no good cache
      // yet).
      console.error('Failed to load App Store data:', e)
      appStoreSignal.value = applyFetchOutcome(appStoreSignal.value, { ok: false, error: String(e) })
    })
}

/**
 * The hover-prefetch/mount entry point: idempotent, a no-op once the signal
 * has been touched at all. "Touched" is read directly off the signal
 * (reference equality against the untouched initialAppStoreState object)
 * rather than a separate module boolean -- loadAppStore() always replaces
 * .value with a new object, so every caller (hover, mount) is just reading
 * the one shared signal, not tracking its own "did I already ask" state.
 */
export function ensureAppStoreLoaded() {
  if (appStoreSignal.value !== initialAppStoreState) return
  loadAppStore()
}
