import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { VNode, TargetedKeyboardEvent } from 'preact'
import { useTranslation } from 'react-i18next'
import { filterNavItems, filterPackages } from '../lib/paletteFilter'
import { useInstalledPackages } from '../context/InstalledPackagesSignal'
import { navItems, type ViewKey } from './Sidebar'
import PackageDetailModal, { type DetailTarget } from './PackageDetailModal'
import { PackageIcon, SearchIcon } from './Icons'

interface Props {
  onNavigate: (view: ViewKey) => void
  bump?: () => void
}

type ResultRow =
  | {
      kind: 'nav'
      rowKey: string
      label: string
      icon: (p: { className?: string }) => VNode
      view: ViewKey
    }
  | { kind: 'package'; rowKey: string; label: string; sublabel: string; name: string; isCask: boolean }

/**
 * Global Cmd+K command palette. Mounted once near the top of the app
 * (sibling to JobConsole/Toasts) so it's summonable from any view. Owns its
 * own open/query/detail state — it doesn't need to live in a shared context
 * since nothing else in the app needs to read or drive it.
 */
export default function CommandPalette({ onNavigate, bump }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // Backed by the shared installed-packages cache (populated at app start
  // and kept fresh in the background), so the palette's package search is
  // warm on first open instead of fetching lazily every session.
  const { packages, loading: packagesLoading } = useInstalledPackages()
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global Cmd+K toggles the palette from anywhere; Escape closes it.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Reset transient state and (re)focus the input every time the palette
  // opens. The package list itself comes from the shared cache, which is
  // already fetched (or in flight) by the time the app renders at all.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }, [open])

  // Translated nav labels, recomputed whenever the active language changes.
  // i18n.language is a real dependency despite the lint warning: react-i18next's
  // `t` keeps a stable reference across language changes, so without this the
  // memo would never recompute when the user switches language.
  const translatedNavItems = useMemo(
    () => navItems.map((item) => ({ ...item, label: t(item.labelKey) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language]
  )

  const results = useMemo<ResultRow[]>(() => {
    const navRows: ResultRow[] = filterNavItems(translatedNavItems, query).map((item) => ({
      kind: 'nav',
      rowKey: `nav:${item.key}`,
      label: item.label,
      icon: item.icon,
      view: item.key,
    }))
    const pkgRows: ResultRow[] = filterPackages(packages ?? [], query).map((p) => ({
      kind: 'package',
      rowKey: `pkg:${p.isCask ? 'cask' : 'formula'}:${p.name}`,
      label: p.name,
      sublabel: p.isCask ? t('common.cask') : t('common.formula'),
      name: p.name,
      isCask: p.isCask,
    }))
    return [...navRows, ...pkgRows]
  }, [query, packages, translatedNavItems, t])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function selectRow(row: ResultRow) {
    if (row.kind === 'nav') {
      onNavigate(row.view)
    } else {
      setDetail({ name: row.name, isCask: row.isCask })
    }
    setOpen(false)
  }

  function handleInputKeyDown(e: TargetedKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = results[activeIndex]
      if (row) selectRow(row)
    }
  }

  return (
    <>
      <dialog className={`modal ${open ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-lg p-0 overflow-hidden">
          <label className="input input-lg w-full rounded-none border-0 border-b border-base-300 focus-within:outline-none">
            <SearchIcon className="size-4 opacity-50" />
            <input
              ref={inputRef}
              type="text"
              placeholder={t('commandPalette.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={handleInputKeyDown}
            />
          </label>
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-base-content/50">
                {packagesLoading ? t('commandPalette.loadingPackages') : t('commandPalette.noMatches')}
              </li>
            )}
            {results.map((row, i) => (
              <li key={row.rowKey}>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left ${
                    i === activeIndex ? 'bg-base-200' : 'hover:bg-base-200/60'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectRow(row)}
                >
                  {row.kind === 'nav' ? (
                    <row.icon className="size-4 shrink-0 opacity-70" />
                  ) : (
                    <PackageIcon className="size-4 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{row.label}</span>
                  {row.kind === 'package' && (
                    <span
                      className={`badge badge-xs badge-outline ml-auto shrink-0 ${
                        row.isCask ? 'badge-secondary' : 'badge-primary'
                      }`}
                    >
                      {row.sublabel}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setOpen(false)}>close</button>
        </form>
      </dialog>

      <PackageDetailModal target={detail} onClose={() => setDetail(null)} onChanged={() => bump?.()} />
    </>
  )
}
