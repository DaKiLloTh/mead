import { signal } from '@preact/signals'
import { api, Service } from '../lib/api'

export interface ServicesState {
  services: Service[]
  loading: boolean
  error: string | null
}

const initialState: ServicesState = { services: [], loading: true, error: null }

/**
 * Shared cache for `brew services list`, so the fetch can start before the
 * Services view ever mounts -- Sidebar fires ensureServicesLoaded() on
 * hover, so by the time a click actually lands the data's often already
 * back. Not polled in the background (unlike InstalledPackagesSignal/
 * SystemInfoSignal/OutdatedSignal): services status is only interesting
 * while someone's actually looking at this view, so there's nothing to gain
 * from fetching it continuously in the background.
 */
export const servicesSignal = signal<ServicesState>(initialState)

/**
 * Always performs a real fetch, for the Refresh button and post-action
 * reloads (start/stop/restart a service, cleanup) -- these need the
 * genuinely current state, not whatever's cached.
 */
export function loadServices() {
  servicesSignal.value = { ...servicesSignal.value, loading: true, error: null }
  api
    .services()
    .then((services) => {
      servicesSignal.value = { services, loading: false, error: null }
    })
    .catch((e) => {
      servicesSignal.value = { ...servicesSignal.value, loading: false, error: String(e) }
    })
}

/**
 * The hover-prefetch/mount entry point: idempotent, a no-op once a fetch
 * has already been touched (by an earlier hover, or the view's own mount).
 * Hovering the sidebar item and then mounting the view both call this, so
 * whichever happens first wins and the other is free -- both are just
 * reading the same servicesSignal, not tracking their own separate "did I
 * already ask for this" state.
 *
 * "Already touched" is read directly off the signal (reference equality
 * against the untouched initialState object) rather than a separate
 * `let requested` module boolean living outside it -- loadServices() always
 * replaces .value with a new object, so this can never true-positive on a
 * value that only coincidentally looks like the initial one.
 */
export function ensureServicesLoaded() {
  if (servicesSignal.value !== initialState) return
  loadServices()
}
