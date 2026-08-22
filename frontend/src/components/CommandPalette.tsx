import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, BrewPackage } from '../lib/api'
import { filterNavItems, filterPackages } from '../lib/paletteFilter'
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
      icon: (p: { className?: string }) => React.ReactElement
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
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [packages, setPackages] = useState<BrewPackage[] | null>(null)
  const [packagesLoading, setPackagesLoading] = useState(false)
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
  // opens. Lazily fetch the installed package list once per app session
  // (cached in this component) rather than on every open.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
    if (packages === null && !packagesLoading) {
      setPackagesLoading(true)
      api
        .listInstalled()
        .then(setPackages)
        .catch(() => setPackages([]))
        .finally(() => setPackagesLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const results = useMemo<ResultRow[]>(() => {
    const navRows: ResultRow[] = filterNavItems(navItems, query).map((item) => ({
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
      sublabel: p.isCask ? 'cask' : 'formula',
      name: p.name,
      isCask: p.isCask,
    }))
    return [...navRows, ...pkgRows]
  }, [query, packages])

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

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
              placeholder="Jump to a view or an installed package…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
            />
          </label>
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-base-content/50">
                {packagesLoading ? 'Loading packages…' : 'No matches.'}
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
                        row.isCask ? 'badge-accent' : 'badge-primary'
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

      <PackageDetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onChanged={() => bump?.()}
      />
    </>
  )
}
