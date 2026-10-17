import { useMemo } from 'preact/hooks'
import { signal, type Signal } from '@preact/signals'

/**
 * useSignal with a lazy initializer. useSignal evaluates its argument on
 * every render and keeps only the first value, so an initializer that reads
 * the DOM or localStorage would run on every render for nothing. This runs
 * `init` once, on mount.
 */
export function useLazySignal<T>(init: () => T): Signal<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => signal(init()), [])
}
