import { signal, effect } from '@preact/signals'
import { api } from '../lib/api'
import { applyFetchOutcome, initialOutdatedState, type OutdatedState } from './outdatedCache'
import { installedPackagesSignal } from './InstalledPackagesSignal'

// Matches InstalledPackagesSignal/SystemInfoSignal's poll interval for the
// same reasoning: infrequent enough not to spam brew, frequent enough that
// external changes show up within about a minute without the user needing
// to do anything.
const POLL_INTERVAL_MS = 60_000

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
export const outdatedSignal = signal<OutdatedState>(initialOutdatedState)

export function refreshOutdated() {
  api
    .outdated(false)
    .then((items) => {
      outdatedSignal.value = applyFetchOutcome(outdatedSignal.value, { ok: true, items })
    })
    .catch((e) => {
      console.error('Failed to refresh outdated packages:', e)
      outdatedSignal.value = applyFetchOutcome(outdatedSignal.value, { ok: false, error: String(e) })
    })
}

let pollingStarted = false

/**
 * Starts Outdated's first fetch, deferred until InstalledPackagesSignal's
 * own first fetch has resolved, plus the 60s background poll once started.
 * Called once from App.tsx at startup.
 *
 * The very first fetch is deliberately deferred rather than firing in the
 * same tick as InstalledPackages' own first fetch: `brew info --json=v2
 * --installed` (InstalledPackagesSignal's call) is comfortably the heaviest
 * of the app's boot-time brew calls, and racing it against this one for
 * CPU/subprocess resources made Installed noticeably slower to load right
 * after launch, exactly when a user is most likely to click straight into
 * it. Gating on installedPackagesSignal.value.loading turning false is a
 * real readiness signal, not an arbitrary delay -- once it's false the
 * heaviest call is out of the way, whether it succeeded or not, and this
 * one can run without competing with it.
 *
 * effect() auto-tracks whatever signals its callback reads -- here, just
 * installedPackagesSignal -- and re-runs the callback on every change to it,
 * the same way a useEffect body re-runs on every change listed in its
 * dependency array, except inferred from the read itself rather than
 * hand-written, so it can't drift out of sync with what's actually read.
 *
 * `started` is a plain closure flag, not a ref: unlike the old Context
 * version, this doesn't live inside a component's render, so there's no
 * remount that could lose a ref's value, and once installedPackagesSignal's
 * loading flips false the first time, this callback becomes a permanent
 * no-op (installedPackagesCache.ts never sets loading back to true after a
 * poll success). Note this can't self-dispose by calling effect()'s own
 * return value from inside the callback: `const stop = effect(fn)` runs
 * `fn` synchronously before `effect()` returns, so referencing `stop` from
 * inside `fn` on that first synchronous call is a TDZ crash if the
 * condition is already true the first time this runs. Leaving the guard
 * clause in place permanently is simplest and exactly as cheap.
 */
export function startOutdatedPolling() {
  if (pollingStarted) return
  pollingStarted = true
  let started = false
  effect(() => {
    if (started || installedPackagesSignal.value.loading) return
    started = true
    refreshOutdated()
    setInterval(refreshOutdated, POLL_INTERVAL_MS)
  })
}

/** Thin wrapper matching the old Context-based hook's exact shape, so call sites didn't need to change. */
export function useOutdated() {
  const state = outdatedSignal.value
  return { ...state, refresh: refreshOutdated }
}
