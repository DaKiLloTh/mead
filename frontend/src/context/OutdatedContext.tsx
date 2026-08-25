import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { applyFetchOutcome, initialOutdatedState, type OutdatedState } from './outdatedCache'

// Matches InstalledPackagesContext/SystemInfoContext's poll interval for the
// same reasoning: infrequent enough not to spam brew, frequent enough that
// external changes show up within about a minute without the user needing
// to do anything.
const POLL_INTERVAL_MS = 60_000

interface OutdatedContextValue extends OutdatedState {
  /** Re-fetch now, instead of waiting for the next poll tick. */
  refresh: () => void
}

const OutdatedContext = createContext<OutdatedContextValue | null>(null)

export function useOutdated(): OutdatedContextValue {
  const ctx = useContext(OutdatedContext)
  if (!ctx) throw new Error('useOutdated must be used within an OutdatedProvider')
  return ctx
}

/**
 * Shared cache for the non-greedy outdated list (`api.outdated(false)`),
 * fetched once at app start and kept fresh by a background poll plus an
 * explicit `refresh()` wired into the app's `bump()` signal.
 *
 * This exists because the sidebar badge (App.tsx) and Updates.tsx used to
 * each run their own independent `api.outdated()` call on every refresh --
 * two separate `brew outdated` subprocess calls racing to resolve, so right
 * after any refresh there was a real window where one had updated and the
 * other hadn't, making the two numbers visibly disagree for a moment (see
 * issue #124, reported happening even with nothing snoozed). Sharing one
 * fetch removes the race outright rather than trying to time them together.
 *
 * Updates.tsx's greedy toggle is a real different query (`--greedy` pulls
 * in a superset Homebrew normally excludes), so it isn't served by this
 * cache -- Updates.tsx does its own supplementary fetch only while that
 * toggle is on, and falls back to this shared, non-greedy cache otherwise.
 *
 * A failed background poll never clears or masks previously-good data, see
 * outdatedCache.ts for the decision logic and why. Only the initial load
 * surfaces a real `error`.
 */
export function OutdatedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OutdatedState>(initialOutdatedState)

  const fetchAndApply = useCallback(() => {
    api
      .outdated(false)
      .then((items) => setState((s) => applyFetchOutcome(s, { ok: true, items })))
      .catch((e) => {
        console.error('Failed to refresh outdated packages:', e)
        setState((s) => applyFetchOutcome(s, { ok: false, error: String(e) }))
      })
  }, [])

  useEffect(() => {
    fetchAndApply()
    const interval = setInterval(fetchAndApply, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAndApply])

  const value: OutdatedContextValue = { ...state, refresh: fetchAndApply }

  return <OutdatedContext.Provider value={value}>{children}</OutdatedContext.Provider>
}
