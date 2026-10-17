import { signal, untracked, useSignalEffect } from '@preact/signals'
import { refreshInstalledPackages } from './InstalledPackagesSignal'
import { refreshSystemInfo } from './SystemInfoSignal'
import { refreshOutdated } from './OutdatedSignal'

/**
 * The app's single "something changed, refresh now" signal. Views that
 * fetch their own data read `refreshSignal.value` inside a useSignalEffect,
 * so every bump() re-runs their fetch.
 *
 * bump() also refreshes the shared installed-packages, system-info and
 * outdated caches directly, so the header and sidebar numbers update no
 * matter which view is mounted. Before that, SystemInfo was only refreshed
 * from Dashboard's own effect, so clicking Update Homebrew on any other
 * view left the last-updated text stale until the 60-second poll.
 */
export const refreshSignal = signal(0)

export function bump() {
  refreshSignal.value++
  refreshInstalledPackages()
  refreshSystemInfo()
  refreshOutdated()
}

/**
 * Runs `fn` on mount and again after every bump(), cleaning up first like
 * any effect. Only refreshSignal is tracked: `fn` runs untracked, so the
 * signals it reads or writes don't make it re-run.
 */
export function useRefreshEffect(fn: () => void | (() => void)) {
  useSignalEffect(() => {
    void refreshSignal.value
    return untracked(fn)
  })
}
