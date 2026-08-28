import { signal } from '@preact/signals'
import { api, MasApp } from '../lib/api'

export interface AppStoreState {
  available: boolean | null
  apps: MasApp[]
  outdated: MasApp[]
  loading: boolean
  error: string | null
}

const initialState: AppStoreState = { available: null, apps: [], outdated: [], loading: true, error: null }

/**
 * Shared cache for the App Store view's data (mas availability, installed
 * apps, outdated apps), so the fetch can start before the view ever mounts
 * -- Sidebar fires ensureAppStoreLoaded() on hover. mas itself is the
 * slowest CLI this app shells out to, so getting a head start here matters
 * more than for most views. Not polled in the background, same reasoning
 * as ServicesSignal: only interesting while someone's looking at it.
 */
export const appStoreSignal = signal<AppStoreState>(initialState)

/** Always performs a real fetch: the Refresh/"try again" button, and post-action reloads (install mas, upgrade an app). */
export function loadAppStore() {
  appStoreSignal.value = { ...appStoreSignal.value, loading: true, error: null }
  api
    .masAvailable()
    .then(async (ok) => {
      if (!ok) {
        appStoreSignal.value = { ...appStoreSignal.value, available: false, loading: false, error: null }
        return
      }
      const [apps, outdated] = await Promise.all([api.masList(), api.masOutdated()])
      appStoreSignal.value = { available: true, apps, outdated, loading: false, error: null }
    })
    .catch((e) => {
      appStoreSignal.value = { ...appStoreSignal.value, loading: false, error: String(e) }
    })
}

/**
 * The hover-prefetch/mount entry point: idempotent, a no-op once the signal
 * has been touched at all. "Touched" is read directly off the signal
 * (reference equality against the untouched initialState object) rather
 * than a separate module boolean -- loadAppStore() always replaces .value
 * with a new object, so every caller (hover, mount) is just reading the
 * one shared signal, not tracking its own "did I already ask" state.
 */
export function ensureAppStoreLoaded() {
  if (appStoreSignal.value !== initialState) return
  loadAppStore()
}
