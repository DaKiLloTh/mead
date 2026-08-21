import { useEffect, useState } from 'react'
import { JobsProvider } from './context/JobsContext'
import { ConfirmProvider } from './context/ConfirmContext'
import Sidebar, { type ViewKey } from './components/Sidebar'
import JobConsole from './components/JobConsole'
import Toasts from './components/Toasts'
import ThemeToggle from './components/ThemeToggle'
import Dashboard from './views/Dashboard'
import Installed from './views/Installed'
import Search from './views/Search'
import Updates from './views/Updates'
import Taps from './views/Taps'
import Services from './views/Services'
import Maintenance from './views/Maintenance'
import { api } from './lib/api'

const titles: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  installed: 'Installed',
  search: 'Search',
  updates: 'Updates',
  taps: 'Taps',
  services: 'Services',
  maintenance: 'Maintenance',
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
          <div className="h-14 shrink-0 border-b border-base-300 flex items-center justify-between px-6">
            <span className="font-medium text-base-content/70">{titles[view]}</span>
            <ThemeToggle />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === 'dashboard' && <Dashboard onNavigate={setView} refreshToken={refreshToken} />}
            {view === 'installed' && <Installed refreshToken={refreshToken} bump={bump} />}
            {view === 'search' && <Search refreshToken={refreshToken} bump={bump} />}
            {view === 'updates' && <Updates refreshToken={refreshToken} bump={bump} />}
            {view === 'taps' && <Taps refreshToken={refreshToken} bump={bump} />}
            {view === 'services' && <Services refreshToken={refreshToken} bump={bump} />}
            {view === 'maintenance' && <Maintenance />}
          </div>
        </div>
      </div>
      <JobConsole />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <JobsProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </JobsProvider>
  )
}
