import { signal } from '@preact/signals'
import { api } from '../lib/api'
import {
  applyFetchOutcome,
  initialCapabilitiesState,
  resolveCapabilities,
  type CapabilitiesState,
} from './capabilitiesCache'

export type { CapabilitiesState }

/**
 * Shared cache for `api.capabilities()`, fetched exactly once at app start
 * (see capabilitiesCache.ts for why this isn't polled the way SystemInfo/
 * InstalledPackages are: the answer can't change during a session). Lives
 * at module scope, same reasoning as the other *Signal.ts caches -- any
 * component reading capabilitiesSignal.value (directly, or through
 * useCapabilities below) during its own render is automatically subscribed.
 */
export const capabilitiesSignal = signal<CapabilitiesState>(initialCapabilitiesState)

export function refreshCapabilities() {
  api
    .capabilities()
    .then((caps) => {
      capabilitiesSignal.value = applyFetchOutcome(capabilitiesSignal.value, { ok: true, caps })
    })
    .catch((e) => {
      console.error('Failed to load platform capabilities:', e)
      capabilitiesSignal.value = applyFetchOutcome(capabilitiesSignal.value, { ok: false, error: String(e) })
    })
}

/**
 * Starts the one-shot fetch. Called once from App.tsx at startup, guarded
 * the same way startSystemInfoPolling is (reference equality against the
 * untouched initial state) so a second call is a no-op.
 */
export function startCapabilitiesLoad() {
  if (capabilitiesSignal.value !== initialCapabilitiesState) return
  refreshCapabilities()
}

/** Always resolves to a real Capabilities value: the loaded one, or the permissive default until it lands. */
export function useCapabilities() {
  return resolveCapabilities(capabilitiesSignal.value)
}
