import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JobsProvider, useJobs } from './context/JobsContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { UserDataProvider } from './context/UserDataContext'
import { InstalledPackagesProvider, useInstalledPackages } from './context/InstalledPackagesContext'
import { SystemInfoProvider } from './context/SystemInfoContext'
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
  const [view, setView] = useState<ViewKey>('dashboard')
  const [refreshToken, setRefreshToken] = useState(0)
  const [outdatedCount, setOutdatedCount] = useState(0)
  const [installedInitialFilter, setInstalledInitialFilter] = useState<InstalledFilter | undefined>(undefined)
  const installedPackages = useInstalledPackages()

  // Dashboard's Health tile needs to land on Installed pre-filtered (e.g. to
  // the deprecated/disabled/pinned subset), while every other caller of
  // onNavigate (Sidebar, CommandPalette, Dashboard's own other stats) just
  // wants a plain view switch. Keep setView as the simple path and only give
  // Dashboard this extra capability.
  const navigateToInstalled = (filter?: InstalledFilter) => {
    setInstalledInitialFilter(filter)
    setView('installed')
  }

  // The single "something changed, refresh now" signal for the whole app.
  // Views still on the per-view fetch-on-refreshToken pattern pick this up
  // via the `refreshToken` prop; the shared installed-packages cache hooks
  // into the same call rather than exposing a second, parallel signal.
  const bump = () => {
    setRefreshToken((t) => t + 1)
    installedPackages.refresh()
  }

  useEffect(() => {
    api
      .outdated()
      .then((o) => setOutdatedCount(o.length))
      .catch(() => {})
  }, [refreshToken])

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
        <Sidebar view={view} onSelect={setView} outdatedCount={outdatedCount} />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="drag-region h-9 shrink-0 flex items-center px-6">
            <span className="text-sm font-medium text-base-content/60">{t(viewTitleKeys[view])}</span>
            <span className="ml-auto flex items-center gap-1 text-base-content/40">
              <kbd className="kbd kbd-xs">⌘</kbd>
              <kbd className="kbd kbd-xs">K</kbd>
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === 'dashboard' && (
              <Dashboard onNavigate={setView} onNavigateInstalled={navigateToInstalled} refreshToken={refreshToken} />
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
      <CommandPalette onNavigate={setView} bump={bump} />
    </div>
  )
}

export default function App() {
  return (
    <JobsProvider>
      <ConfirmProvider>
        <UserDataProvider>
          <InstalledPackagesProvider>
            <SystemInfoProvider>
              <AppShell />
            </SystemInfoProvider>
          </InstalledPackagesProvider>
        </UserDataProvider>
      </ConfirmProvider>
    </JobsProvider>
  )
}
