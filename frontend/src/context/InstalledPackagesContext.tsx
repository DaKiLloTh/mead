import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { applyFetchOutcome, initialInstalledPackagesState, type InstalledPackagesState } from './installedPackagesCache'
import { prefetchCaskIcons } from '../lib/useCaskIcon'

// Poll interval for picking up changes made outside mead (e.g. a `brew
// install` run in a real Terminal while the app is open). Chosen to be
// infrequent enough not to spam `brew list`-equivalent calls, but frequent
// enough that external changes show up within about a minute without the
// user needing to do anything.
const POLL_INTERVAL_MS = 60_000

interface InstalledPackagesContextValue extends InstalledPackagesState {
  /** Re-fetch now, instead of waiting for the next poll tick. */
  refresh: () => void
}

const InstalledPackagesContext = createContext<InstalledPackagesContextValue | null>(null)

export function useInstalledPackages(): InstalledPackagesContextValue {
  const ctx = useContext(InstalledPackagesContext)
  if (!ctx) throw new Error('useInstalledPackages must be used within an InstalledPackagesProvider')
  return ctx
}

/**
 * Shared cache for the installed-packages list (`api.listInstalled()`),
 * fetched once at app start and kept fresh by a background poll plus an
 * explicit `refresh()` that call sites invoke after they change installed
 * state (wired into the app's existing `bump()`/`refreshToken` "something
 * changed" signal in App.tsx, rather than introducing a second one).
 *
 * A failed background poll never clears or masks previously-good data — see
 * installedPackagesCache.ts for the decision logic and why. Only the
 * initial load surfaces a real `error`.
 */
export function InstalledPackagesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstalledPackagesState>(initialInstalledPackagesState)

  const fetchAndApply = useCallback(() => {
    api
      .listInstalled()
      .then((packages) => {
        setState((s) => applyFetchOutcome(s, { ok: true, packages }))
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
        setState((s) => applyFetchOutcome(s, { ok: false, error: String(e) }))
      })
  }, [])

  useEffect(() => {
    fetchAndApply()
    const interval = setInterval(fetchAndApply, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAndApply])

  const value: InstalledPackagesContextValue = { ...state, refresh: fetchAndApply }

  return <InstalledPackagesContext.Provider value={value}>{children}</InstalledPackagesContext.Provider>
}
