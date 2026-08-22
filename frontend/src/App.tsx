import { useEffect, useState } from 'react'
import { JobsProvider } from './context/JobsContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { UserDataProvider } from './context/UserDataContext'
import Sidebar, { type ViewKey } from './components/Sidebar'
import JobConsole from './components/JobConsole'
import Toasts from './components/Toasts'
import CommandPalette from './components/CommandPalette'
import Dashboard from './views/Dashboard'
import Installed from './views/Installed'
import Search from './views/Search'
import Collections from './views/Collections'
import Updates from './views/Updates'
import Taps from './views/Taps'
import Services from './views/Services'
import Adopt from './views/Adopt'
import AppStore from './views/AppStore'
import Security from './views/Security'
import Maintenance from './views/Maintenance'
import History from './views/History'
import Settings from './views/Settings'
import { api } from './lib/api'

const titles: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  installed: 'Installed',
  search: 'Search',
  collections: 'Collections',
  updates: 'Updates',
  taps: 'Taps',
  services: 'Services',
  adopt: 'Adopt Existing Apps',
  appstore: 'App Store',
  security: 'Security',
  maintenance: 'Maintenance',
  history: 'History',
  settings: 'Settings',
}

function AppShell() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [refreshToken, setRefreshToken] = useState(0)
  const [outdatedCount, setOutdatedCount] = useState(0)

  const bump = () => setRefreshToken((t) => t + 1)

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
            <span className="text-sm font-medium text-base-content/60">{titles[view]}</span>
            <span className="ml-auto flex items-center gap-1 text-base-content/40">
              <kbd className="kbd kbd-xs">⌘</kbd>
              <kbd className="kbd kbd-xs">K</kbd>
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === 'dashboard' && <Dashboard onNavigate={setView} refreshToken={refreshToken} />}
            {view === 'installed' && <Installed refreshToken={refreshToken} bump={bump} />}
            {view === 'search' && <Search refreshToken={refreshToken} bump={bump} />}
            {view === 'collections' && <Collections bump={bump} />}
            {view === 'updates' && <Updates refreshToken={refreshToken} bump={bump} />}
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
          <AppShell />
        </UserDataProvider>
      </ConfirmProvider>
    </JobsProvider>
  )
}
