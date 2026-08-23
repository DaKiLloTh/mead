import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { applyFetchOutcome, initialSystemInfoState, type SystemInfoState } from './systemInfoCache'

// Poll interval for picking up changes made outside mead (e.g. `brew
// install`/`brew upgrade` run in a real Terminal while the app is open).
// Matches InstalledPackagesContext's poll interval for the same reasoning:
// infrequent enough not to spam brew, frequent enough that external changes
// show up within about a minute without the user needing to do anything.
const POLL_INTERVAL_MS = 60_000

interface SystemInfoContextValue extends SystemInfoState {
  /** Re-fetch now, instead of waiting for the next poll tick. */
  refresh: () => void
}

const SystemInfoContext = createContext<SystemInfoContextValue | null>(null)

export function useSystemInfo(): SystemInfoContextValue {
  const ctx = useContext(SystemInfoContext)
  if (!ctx) throw new Error('useSystemInfo must be used within a SystemInfoProvider')
  return ctx
}

/**
 * Shared cache for system info (`api.getSystemInfo()`), fetched once at app
 * start and kept fresh by a background poll plus an explicit `refresh()`
 * that call sites invoke after they change system state. Dashboard is the
 * only current consumer, but the cache lives above it so navigating away
 * and back doesn't reset to a loading spinner (see issue #76).
 *
 * A failed background poll never clears or masks previously-good data, see
 * systemInfoCache.ts for the decision logic and why. Only the initial load
 * surfaces a real `error`.
 */
export function SystemInfoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SystemInfoState>(initialSystemInfoState)

  const fetchAndApply = useCallback(() => {
    api
      .getSystemInfo()
      .then((info) => setState((s) => applyFetchOutcome(s, { ok: true, info })))
      .catch((e) => {
        // Log so a silently-swallowed background poll failure is still
        // visible for debugging, without surfacing a user-facing error for
        // what's meant to be an invisible refresh (applyFetchOutcome only
        // turns this into a visible `error` if there's no good cache yet).
        console.error('Failed to refresh system info:', e)
        setState((s) => applyFetchOutcome(s, { ok: false, error: String(e) }))
      })
  }, [])

  useEffect(() => {
    fetchAndApply()
    const interval = setInterval(fetchAndApply, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAndApply])

  const value: SystemInfoContextValue = { ...state, refresh: fetchAndApply }

  return <SystemInfoContext.Provider value={value}>{children}</SystemInfoContext.Provider>
}
