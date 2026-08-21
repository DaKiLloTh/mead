import type { ReactElement } from 'react'
import {
  DashboardIcon,
  LayersIcon,
  PackageIcon,
  SearchIcon,
  ServerIcon,
  TapIcon,
  WrenchIcon,
} from './Icons'

export type ViewKey = 'dashboard' | 'installed' | 'search' | 'updates' | 'taps' | 'services' | 'maintenance'

interface NavItem {
  key: ViewKey
  label: string
  icon: (p: { className?: string }) => ReactElement
}

const items: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { key: 'installed', label: 'Installed', icon: PackageIcon },
  { key: 'search', label: 'Search', icon: SearchIcon },
  { key: 'updates', label: 'Updates', icon: LayersIcon },
  { key: 'taps', label: 'Taps', icon: TapIcon },
  { key: 'services', label: 'Services', icon: ServerIcon },
  { key: 'maintenance', label: 'Maintenance', icon: WrenchIcon },
]

interface Props {
  view: ViewKey
  onSelect: (v: ViewKey) => void
  outdatedCount: number
}

export default function Sidebar({ view, onSelect, outdatedCount }: Props) {
  return (
    <div className="w-56 shrink-0 bg-base-200 border-r border-base-300 flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-base-300">
        <span className="text-xl">🍺</span>
        <span className="font-bold tracking-tight">brewtender</span>
      </div>
      <ul className="menu p-2 gap-0.5 flex-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.key}>
              <a
                className={view === item.key ? 'menu-active' : ''}
                onClick={(e) => {
                  e.preventDefault()
                  onSelect(item.key)
                }}
              >
                <Icon className="size-4" />
                {item.label}
                {item.key === 'updates' && outdatedCount > 0 && (
                  <span className="badge badge-sm badge-warning ml-auto">{outdatedCount}</span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
