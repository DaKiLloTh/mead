import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
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
  labelKey: string
  icon: (p: { className?: string }) => ReactElement
}

interface NavGroup {
  titleKey: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  { titleKey: '', items: [{ key: 'dashboard', labelKey: 'nav.items.dashboard', icon: DashboardIcon }] },
  {
    titleKey: 'nav.groupPackages',
    items: [
      { key: 'installed', labelKey: 'nav.items.installed', icon: PackageIcon },
      { key: 'search', labelKey: 'nav.items.search', icon: SearchIcon },
      { key: 'collections', labelKey: 'nav.items.collections', icon: GridIcon },
      { key: 'updates', labelKey: 'nav.items.updates', icon: LayersIcon },
    ],
  },
  {
    titleKey: 'nav.groupSystem',
    items: [
      { key: 'taps', labelKey: 'nav.items.taps', icon: TapIcon },
      { key: 'services', labelKey: 'nav.items.services', icon: ServerIcon },
      { key: 'adopt', labelKey: 'nav.items.adopt', icon: ImportIcon },
      { key: 'appstore', labelKey: 'nav.items.appstore', icon: StoreIcon },
    ],
  },
  {
    titleKey: 'nav.groupCare',
    items: [
      { key: 'security', labelKey: 'nav.items.security', icon: ShieldIcon },
      { key: 'maintenance', labelKey: 'nav.items.maintenance', icon: WrenchIcon },
      { key: 'history', labelKey: 'nav.items.history', icon: ClockIcon },
    ],
  },
]

const settingsItem: NavItem = { key: 'settings', labelKey: 'nav.items.settings', icon: GearIcon }

/** Every navigable view, in display order (sidebar groups, then Settings). */
export const navItems: NavItem[] = [...groups.flatMap((g) => g.items), settingsItem]

interface Props {
  view: ViewKey
  onSelect: (v: ViewKey) => void
  outdatedCount: number
}

export default function Sidebar({ view, onSelect, outdatedCount }: Props) {
  const { t } = useTranslation()
  return (
    <div className="w-56 shrink-0 bg-base-200/70 backdrop-blur-xl border-r border-base-300/60 flex flex-col">
      <div className="drag-region h-9 shrink-0" />
      <div className="shrink-0 flex items-center gap-2 px-4 pt-2 pb-3">
        <span className="text-xl">🍺</span>
        <span className="font-bold tracking-tight">{t('nav.brand')}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((group, gi) => (
          <ul key={gi} className="menu p-2 gap-0.5">
            {group.titleKey && <li className="menu-title">{t(group.titleKey)}</li>}
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
                    {t(item.labelKey)}
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
            {t(settingsItem.labelKey)}
          </a>
        </li>
      </ul>
    </div>
  )
}
