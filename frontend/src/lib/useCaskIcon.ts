import { useEffect, useState } from 'preact/hooks'
import { api } from './api'

// Frontend-side mirror of the backend's in-memory icon cache (App.icons in
// internal/app/app.go), keyed by cask name. Avoids re-invoking the Wails
// RPC call -- and therefore re-hitting the backend's own cache -- every
// time a component using the same cask's icon re-renders or remounts (e.g.
// scrolling the Applications grid, closing and reopening the detail modal
// for the same package). Module-level, so it's shared across every
// component using useCaskIcon; cleared implicitly on a full page reload,
// same lifetime as the backend cache.
const cache = new Map<string, string>()

// Dedupes concurrent requests for the same cask name (e.g. the same cask
// showing up in both the Installed list and, briefly, the detail modal) so
// only one RPC call/extraction happens for it at a time.
const inflight = new Map<string, Promise<string>>()

// Caps how many CaskIcon RPC calls (each a plutil + sips shell-out on the
// backend) are in flight at once. The Applications grid can mount dozens
// of icon requests simultaneously; without a cap they'd all fire at once,
// spiking process/CPU usage in a short burst instead of spreading the cost
// out. Modeled as a tiny queue/semaphore rather than pulling in a
// dependency for something this small.
const MAX_CONCURRENT_REQUESTS = 6
let activeRequestCount = 0
const requestQueue: (() => void)[] = []

function withConcurrencyLimit<T>(run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeRequestCount++
      run()
        .then(resolve, reject)
        .finally(() => {
          activeRequestCount--
          const next = requestQueue.shift()
          if (next) next()
        })
    }
    if (activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      start()
    } else {
      requestQueue.push(start)
    }
  })
}

function fetchIcon(cacheKey: string, run: () => Promise<string>): Promise<string> {
  let promise = inflight.get(cacheKey)
  if (!promise) {
    promise = withConcurrencyLimit(run).catch(() => '')
    inflight.set(cacheKey, promise)
  }
  return promise
}

/**
 * Warms the shared icon cache for a batch of cask names in the background,
 * before any component actually needs them. Without this, a cask's icon
 * only starts fetching once a `PackageIcon` using it mounts, e.g. the
 * moment you open Installed or Applications, so every icon visibly pops in
 * a beat after the rest of the row/tile. Calling this as soon as the
 * installed-packages list is known (see InstalledPackagesContext) means
 * the cache is already warm by the time the user actually navigates to a
 * view that renders icons.
 *
 * Goes through the same `fetchIcon`/cache/concurrency-limit/dedupe path a
 * real `useCaskIcon` call would, it's not a second, parallel fetch
 * mechanism, just triggering the existing one early. Already-cached or
 * already-inflight names are skipped for free (`fetchIcon` itself dedupes),
 * this loop just avoids bothering to call it for names we can already see
 * are cached, to keep the common case (mostly-warm cache) cheap.
 */
export function prefetchCaskIcons(names: string[]): void {
  for (const name of names) {
    if (cache.has(name)) continue
    fetchIcon(name, () => api.caskIcon(name)).then((uri) => {
      cache.set(name, uri)
    })
  }
}

/**
 * Fetches (and caches) a cask's real app icon as a data URI. Returns null
 * while loading, while unavailable (extraction failed, or this isn't a
 * cask at all -- formulae never have an app icon), or once a lookup comes
 * back empty -- callers should render the monogram fallback (see
 * ../components/PackageIcon.tsx) whenever this returns null.
 */
export function useCaskIcon(name: string | undefined, isCask: boolean): string | null {
  return useIcon(isCask ? name : undefined, name ?? '', () => api.caskIcon(name ?? ''))
}

/**
 * Same shape and caching behavior as useCaskIcon, but for a Mac App Store
 * app's icon (see App.MasAppIcon in internal/app/app.go). `available` gates
 * the fetch the same way `isCask` gates useCaskIcon -- pass false (or omit
 * a name) for anything that isn't a mas app, e.g. when a component might
 * render either a cask or a mas app depending on context.
 *
 * Cache key is prefixed the same way the backend's own cache prefixes it,
 * to keep this namespace separate from useCaskIcon's even though a real
 * collision between a cask token and a mas display name is unlikely.
 */
export function useMasAppIcon(name: string | undefined, available: boolean): string | null {
  return useIcon(available ? name : undefined, `mas:${name ?? ''}`, () => api.masAppIcon(name ?? ''))
}

function useIcon(name: string | undefined, cacheKey: string, run: () => Promise<string>): string | null {
  const [icon, setIcon] = useState<string | null>(() => (name ? cache.get(cacheKey) || null : null))

  useEffect(() => {
    if (!name) {
      setIcon(null)
      return
    }
    const cached = cache.get(cacheKey)
    if (cached !== undefined) {
      setIcon(cached || null)
      return
    }

    setIcon(null)
    let cancelled = false
    fetchIcon(cacheKey, run).then((uri) => {
      cache.set(cacheKey, uri)
      if (!cancelled) setIcon(uri || null)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, cacheKey])

  return icon
}
