import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JobsProvider, useJobs } from './context/JobsContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { UserDataProvider, useUserData } from './context/UserDataContext'
import { useInstalledPackages, startInstalledPackagesPolling } from './context/InstalledPackagesSignal'
import { useSystemInfo, startSystemInfoPolling } from './context/SystemInfoSignal'
import { useOutdated, startOutdatedPolling } from './context/OutdatedSignal'
import { RefreshIcon } from './components/Icons'
import { formatHomebrewLastUpdated } from './lib/formatHomebrewLastUpdated'
import Sidebar, { type ViewKey } from './components/Sidebar'
import JobConsole from './components/JobConsole'
import Toasts from './components/Toasts'
import CommandPalette from './components/CommandPalette'
import Dashboard from './views/Dashboard'
import Installed, { type Filter as InstalledFilter } from './views/Installed'
import Search from './views/Search'
import Collections from './views/Collections'
import Updates from './views/Updates'
import Applications from './views/Applications'
import Taps from './views/Taps'
import Services from './views/Services'
import Adopt from './views/Adopt'
import AppStore from './views/AppStore'
import Security from './views/Security'
import Maintenance from './views/Maintenance'
import History from './views/History'
import Settings from './views/Settings'
import { api } from './lib/api'

// How often to refresh Homebrew's own local update index in the background
// (`brew update`, a real network call against Homebrew's taps -- not to be
// confused with InstalledPackagesContext/SystemInfoContext's own 60-second
// polls, which are cheap local checks). `brew outdated` only ever compares
// against whatever this index already has cached, so without a periodic
// refresh a long-running session never sees genuinely new releases unless
// the user clicks "Update Homebrew" themselves. 30 minutes is far less
// frequent than the local polls above, but frequent enough that the
// Dashboard's "last updated" indicator (see issue #77) stays meaningfully
// fresh across a session. See issue #88.
const BACKGROUND_HOMEBREW_UPDATE_INTERVAL_MS = 30 * 60 * 1000

const viewTitleKeys: Record<ViewKey, string> = {
  dashboard: 'app.viewTitles.dashboard',
  installed: 'app.viewTitles.installed',
  search: 'app.viewTitles.search',
  collections: 'app.viewTitles.collections',
  updates: 'app.viewTitles.updates',
  applications: 'app.viewTitles.applications',
  taps: 'app.viewTitles.taps',
  services: 'app.viewTitles.services',
  adopt: 'app.viewTitles.adopt',
  appstore: 'app.viewTitles.appstore',
  security: 'app.viewTitles.security',
  maintenance: 'app.viewTitles.maintenance',
  history: 'app.viewTitles.history',
  settings: 'app.viewTitles.settings',
}

function AppShell() {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const { info: systemInfo, refresh: refreshSystemInfo } = useSystemInfo()
  const userData = useUserData()
  const outdated = useOutdated()
  const [view, setView] = useState<ViewKey>('dashboard')
  const [refreshToken, setRefreshToken] = useState(0)
  const [installedInitialFilter, setInstalledInitialFilter] = useState<InstalledFilter | undefined>(undefined)
  const [headerUpdateBusy, setHeaderUpdateBusy] = useState(false)
  const installedPackages = useInstalledPackages()

  // Starts the three signal-backed caches exactly once, for the life of the
  // app. There's no Provider mount position for this to hook into anymore
  // (see InstalledPackagesSignal.ts), so it's kicked off explicitly here
  // instead. startOutdatedPolling() internally defers its first fetch until
  // InstalledPackages' first fetch resolves -- callers don't need to know or
  // care about that ordering.
  useEffect(() => {
    startInstalledPackagesPolling()
    startSystemInfoPolling()
    startOutdatedPolling()
  }, [])

  // Dashboard's Health tile and stat tiles need to land on Installed
  // pre-filtered (e.g. to the deprecated/disabled/pinned subset), while
  // every other caller of onNavigate (Sidebar, CommandPalette) just wants a
  // plain view switch. changeView is that plain path, and every one of
  // those callers goes through it rather than setView directly, so that a
  // later, unrelated visit to Installed doesn't inherit a stale filter from
  // some earlier Health-tile click -- installedInitialFilter previously
  // stuck around in this state forever once set, since nothing ever cleared
  // it back to undefined (see issue #114): click "Deprecated" on Dashboard,
  // navigate elsewhere, then open Installed again from the sidebar, and it
  // would still land pre-filtered to Deprecated instead of showing All.
  const changeView = (v: ViewKey) => {
    setInstalledInitialFilter(undefined)
    setView(v)
  }

  const navigateToInstalled = (filter?: InstalledFilter) => {
    setInstalledInitialFilter(filter)
    setView('installed')
  }

  // The single "something changed, refresh now" signal for the whole app.
  // Views still on the per-view fetch-on-refreshToken pattern pick this up
  // via the `refreshToken` prop; the shared installed-packages and
  // system-info caches hook into the same call rather than exposing a
  // second, parallel signal each.
  //
  // SystemInfoContext's own refresh() was previously only reached
  // indirectly, via Dashboard.tsx's local effect on refreshToken -- which
  // meant clicking the global header's Update Homebrew button (or the
  // background quiet-update tick) while on any view other than Dashboard
  // left the outdated count / last-updated text stale until the context's
  // own 60-second poll caught up. Calling it here directly means bump()
  // actually refreshes everything it's documented to, regardless of which
  // view is currently mounted.
  const bump = () => {
    setRefreshToken((t) => t + 1)
    installedPackages.refresh()
    refreshSystemInfo()
    outdated.refresh()
  }

  // Global "Update Homebrew" trigger for the top bar (see issue #89), so the
  // action is reachable from every view, not just Dashboard's own Quick
  // Actions button. Mirrors Dashboard's own handler: run the job, then call
  // bump() so Dashboard and Updates pick up the fresh state, same as
  // Dashboard's own button does via its local refresh().
  const runHeaderUpdate = () => {
    setHeaderUpdateBusy(true)
    runAction(() => api.update())
      .catch((e) => {
        console.error('Homebrew update failed:', e)
      })
      .finally(() => {
        setHeaderUpdateBusy(false)
        bump()
      })
  }

  // Derived from the shared OutdatedContext cache (see OutdatedContext.tsx),
  // not a separate fetch -- App.tsx and Updates.tsx used to each run their
  // own independent `api.outdated()` call, which raced on every refresh and
  // could disagree for a moment even with nothing snoozed (issue #124).
  // Matches Updates.tsx's own "N update(s)" headline, which is
  // visible.length (snoozed packages excluded), not the raw outdated count.
  const outdatedCount = useMemo(
    () => (outdated.items ?? []).filter((p) => !userData.snoozedUntil(p.name, p.isCask)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outdated.items, userData.data]
  )

  // Periodically refresh Homebrew's own update index in the background (see
  // issue #88 and BACKGROUND_HOMEBREW_UPDATE_INTERVAL_MS above), for as long
  // as this component is mounted -- i.e. for the life of the app session.
  // mead is a normal desktop app that's closed rather than backgrounded on
  // macOS, so tying this to the frontend's own lifecycle is a reasonable
  // stand-in for "only while the window is actually open and in front of the
  // user" without needing to detect OS-level window focus.
  //
  // Runs as a quiet job (api.updateQuiet(), not api.update()) so it doesn't
  // pop open the job console or a toast every time it fires -- see
  // jobTracker.ts's handling of JobState.quiet. Once it completes, `bump()`
  // is called regardless of success or failure: it's the app's existing
  // "something changed" signal, and re-running it is harmless even when the
  // update itself failed (e.g. offline). A failure is only logged, mirroring
  // how systemInfoCache.ts/installedPackagesCache.ts already keep background
  // fetch failures silent.
  useEffect(() => {
    const interval = setInterval(() => {
      runAction(() => api.updateQuiet())
        .catch((e) => {
          console.error('Background Homebrew update failed:', e)
        })
        .finally(() => {
          bump()
        })
    }, BACKGROUND_HOMEBREW_UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full flex flex-col bg-base-100 text-base-content">
      <div className="flex flex-1 min-h-0">
        <Sidebar view={view} onSelect={changeView} outdatedCount={outdatedCount} />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="drag-region h-14 shrink-0 flex items-center px-6 border-b border-base-300">
            <span className="text-sm font-medium text-base-content/60">{t(viewTitleKeys[view])}</span>
            <div className="ml-auto flex items-center gap-4">
              {systemInfo && (
                <div className="text-xs text-base-content/50 text-right no-drag hidden sm:block leading-tight">
                  <div className="font-mono">{systemInfo.brewVersion}</div>
                  <div>
                    {t('common.lastUpdatedLabel')} {formatHomebrewLastUpdated(t, systemInfo.homebrewLastUpdated)}
                  </div>
                </div>
              )}
              <button className="btn btn-sm btn-outline no-drag" disabled={headerUpdateBusy} onClick={runHeaderUpdate}>
                {headerUpdateBusy ? <span className="loading loading-spinner loading-xs" /> : <RefreshIcon className="size-4" />}
                {t('common.updateHomebrew')}
              </button>
              <span className="flex items-center gap-1 text-base-content/40">
                <kbd className="kbd kbd-xs">⌘</kbd>
                <kbd className="kbd kbd-xs">K</kbd>
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === 'dashboard' && (
              <Dashboard onNavigate={changeView} onNavigateInstalled={navigateToInstalled} refreshToken={refreshToken} />
            )}
            {view === 'installed' && (
              <Installed refreshToken={refreshToken} bump={bump} initialFilter={installedInitialFilter} />
            )}
            {view === 'search' && <Search refreshToken={refreshToken} bump={bump} />}
            {view === 'collections' && <Collections bump={bump} />}
            {view === 'updates' && <Updates refreshToken={refreshToken} bump={bump} />}
            {view === 'applications' && <Applications bump={bump} />}
            {view === 'taps' && <Taps refreshToken={refreshToken} bump={bump} />}
            {view === 'services' && <Services refreshToken={refreshToken} bump={bump} />}
            {view === 'adopt' && <Adopt bump={bump} />}
            {view === 'appstore' && <AppStore />}
            {view === 'security' && <Security />}
            {view === 'maintenance' && <Maintenance />}
            {view === 'history' && <History />}
            {view === 'settings' && <Settings />}
          </div>
        </div>
      </div>
      <JobConsole />
      <Toasts />
      <CommandPalette onNavigate={changeView} bump={bump} />
    </div>
  )
}

// InstalledPackages/SystemInfo/Outdated no longer need Provider positions --
// their state lives in module-level signals (see *Signal.ts) that are
// reachable from anywhere. JobsProvider/ConfirmProvider/UserDataProvider stay
// as ordinary Context; see each context file for why converting it to a
// signal wouldn't be a real improvement.
export default function App() {
  return (
    <JobsProvider>
      <ConfirmProvider>
        <UserDataProvider>
          <AppShell />
        </UserDataProvider>
      </ConfirmProvider>
    </JobsProvider>
  )
}
