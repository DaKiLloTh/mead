import { signal } from '@preact/signals'
import { api } from '../lib/api'
import { applyScanOutcome, initialAdoptState, removeCandidate, startScan, type AdoptState } from './adoptCache'

/**
 * Shared cache for the Adopt page's last scan of /Applications.
 *
 * This lives outside the Adopt view so the results survive navigating away
 * and back (issue #201). A scan still in flight when the view unmounts keeps
 * running and lands here. See adoptCache.ts for the state transitions.
 */
export const adoptSignal = signal<AdoptState>(initialAdoptState)

export async function scanAdoptable() {
  if (adoptSignal.value.scanning) return
  adoptSignal.value = startScan(adoptSignal.value)
  try {
    const items = await api.scanAdoptableApps()
    adoptSignal.value = applyScanOutcome(adoptSignal.value, { ok: true, items })
  } catch (e) {
    adoptSignal.value = applyScanOutcome(adoptSignal.value, { ok: false, error: String(e) })
  }
}

export function markAdopted(caskToken: string) {
  adoptSignal.value = removeCandidate(adoptSignal.value, caskToken)
}
