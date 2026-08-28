import { signal } from '@preact/signals'
import { api } from '../lib/api'
import { applyFetchOutcome, initialInstalledPackagesState, type InstalledPackagesState } from './installedPackagesCache'
import { prefetchCaskIcons } from '../lib/useCaskIcon'

// Poll interval for picking up changes made outside mead (e.g. a `brew
// install` run in a real Terminal while the app is open). Chosen to be
// infrequent enough not to spam `brew list`-equivalent calls, but frequent
// enough that external changes show up within about a minute without the
// user needing to do anything.
const POLL_INTERVAL_MS = 60_000

/**
 * Shared cache for the installed-packages list (`api.listInstalled()`),
 * fetched once at app start and kept fresh by a background poll plus an
 * explicit `refresh()` that call sites invoke after they change installed
 * state (wired into the app's existing `bump()`/`refreshToken` "something
 * changed" signal in App.tsx, rather than introducing a second one).
 *
 * This is a plain module-level signal rather than a Context/Provider: any
 * component that reads `installedPackagesSignal.value` (directly, or through
 * useInstalledPackages below) during its own render is automatically
 * subscribed to updates, the same way a hook call is detected, so there's no
 * Provider position needed for it to be reachable and no dependency array to
 * keep in sync.
 *
 * A failed background poll never clears or masks previously-good data, see
 * installedPackagesCache.ts for the decision logic and why. Only the
 * initial load surfaces a real `error`.
 */
export const installedPackagesSignal = signal<InstalledPackagesState>(initialInstalledPackagesState)

export function refreshInstalledPackages() {
  api
    .listInstalled()
    .then((packages) => {
      installedPackagesSignal.value = applyFetchOutcome(installedPackagesSignal.value, { ok: true, packages })
      // Warm the icon cache in the background as soon as we know what's
      // installed, rather than waiting for Installed/Applications to
      // actually mount and request each icon on demand, which is what
      // caused icons to visibly pop in a beat after the rest of the
      // row/tile. Cheap no-op for names already cached.
      prefetchCaskIcons(packages.filter((p) => p.isCask).map((p) => p.name))
    })
    .catch((e) => {
      // Log so a silently-swallowed background poll failure is still
      // visible for debugging, without surfacing a user-facing error for
      // what's meant to be an invisible refresh (applyFetchOutcome only
      // turns this into a visible `error` if there's no good cache yet).
      console.error('Failed to refresh installed packages:', e)
      installedPackagesSignal.value = applyFetchOutcome(installedPackagesSignal.value, { ok: false, error: String(e) })
    })
}

/**
 * Starts the initial fetch plus the 60s background poll. Called once from
 * App.tsx at startup. Guarded so a second call (e.g. a remount during dev)
 * is a no-op, since the signal and its interval already live for the life
 * of the process, not tied to any component's mount lifecycle.
 *
 * "Already started" is read directly off the signal (reference equality
 * against the untouched initialInstalledPackagesState object) rather than a
 * separate `let pollingStarted` module boolean -- one source of truth,
 * consistent with ServicesSignal.ts/AppStoreSignal.ts's ensureXLoaded().
 */
export function startInstalledPackagesPolling() {
  if (installedPackagesSignal.value !== initialInstalledPackagesState) return
  refreshInstalledPackages()
  setInterval(refreshInstalledPackages, POLL_INTERVAL_MS)
}

/** Thin wrapper matching the old Context-based hook's exact shape, so call sites didn't need to change. */
export function useInstalledPackages() {
  const state = installedPackagesSignal.value
  return { ...state, refresh: refreshInstalledPackages }
}
