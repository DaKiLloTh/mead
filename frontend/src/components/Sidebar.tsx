import type { ReactElement } from 'react'
import {
  ClockIcon,
  DashboardIcon,
  GearIcon,
  GridIcon,
  ImportIcon,
  LayersIcon,
  PackageIcon,
  SearchIcon,
  ServerIcon,
  ShieldIcon,
  StoreIcon,
  TapIcon,
  WrenchIcon,
} from './Icons'

export type ViewKey =
  | 'dashboard'
  | 'installed'
  | 'search'
  | 'collections'
  | 'updates'
  | 'taps'
  | 'services'
  | 'adopt'
  | 'appstore'
  | 'security'
  | 'maintenance'
  | 'history'
  | 'settings'

export interface NavItem {
  key: ViewKey
  label: string
  icon: (p: { className?: string }) => ReactElement
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  { title: '', items: [{ key: 'dashboard', label: 'Dashboard', icon: DashboardIcon }] },
  {
    title: 'Packages',
    items: [
      { key: 'installed', label: 'Installed', icon: PackageIcon },
      { key: 'search', label: 'Search', icon: SearchIcon },
      { key: 'collections', label: 'Collections', icon: GridIcon },
      { key: 'updates', label: 'Updates', icon: LayersIcon },
    ],
  },
  {
    title: 'System',
    items: [
      { key: 'taps', label: 'Taps', icon: TapIcon },
      { key: 'services', label: 'Services', icon: ServerIcon },
      { key: 'adopt', label: 'Adopt Apps', icon: ImportIcon },
      { key: 'appstore', label: 'App Store', icon: StoreIcon },
    ],
  },
  {
    title: 'Care',
    items: [
      { key: 'security', label: 'Security', icon: ShieldIcon },
      { key: 'maintenance', label: 'Maintenance', icon: WrenchIcon },
      { key: 'history', label: 'History', icon: ClockIcon },
    ],
  },
]

const settingsItem: NavItem = { key: 'settings', label: 'Settings', icon: GearIcon }

/** Every navigable view, in display order (sidebar groups, then Settings). */
export const navItems: NavItem[] = [...groups.flatMap((g) => g.items), settingsItem]

interface Props {
  view: ViewKey
  onSelect: (v: ViewKey) => void
  outdatedCount: number
}

export default function Sidebar({ view, onSelect, outdatedCount }: Props) {
  return (
    <div className="w-56 shrink-0 bg-base-200/70 backdrop-blur-xl border-r border-base-300/60 flex flex-col">
      <div className="drag-region h-9 shrink-0" />
      <div className="shrink-0 flex items-center gap-2 px-4 pt-2 pb-3">
        <span className="text-xl">🍺</span>
        <span className="font-bold tracking-tight">mead</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((group, gi) => (
          <ul key={gi} className="menu p-2 gap-0.5">
            {group.title && <li className="menu-title">{group.title}</li>}
            {group.items.map((item) => {
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
        ))}
      </div>
      <ul className="menu p-2 gap-0.5 shrink-0">
        <li>
          <a
            className={view === 'settings' ? 'menu-active' : ''}
            onClick={(e) => {
              e.preventDefault()
              onSelect('settings')
            }}
          >
            <settingsItem.icon className="size-4" />
            {settingsItem.label}
          </a>
        </li>
      </ul>
    </div>
  )
}
