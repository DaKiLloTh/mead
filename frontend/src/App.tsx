import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JobsProvider } from './context/JobsContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { UserDataProvider } from './context/UserDataContext'
import { InstalledPackagesProvider, useInstalledPackages } from './context/InstalledPackagesContext'
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
            <AppShell />
          </InstalledPackagesProvider>
        </UserDataProvider>
      </ConfirmProvider>
    </JobsProvider>
  )
}
