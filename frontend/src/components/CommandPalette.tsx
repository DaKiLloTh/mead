import { useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { useSignalRef } from '@preact/signals/utils'
import type { VNode, TargetedKeyboardEvent } from 'preact'
import { useTranslation } from 'react-i18next'
import { filterNavItems, filterPackages } from '../lib/paletteFilter'
import { isPrimaryShortcutModifierPressed, visibleNavItems } from '../lib/navCapabilities'
import { installedPackagesSignal } from '../context/InstalledPackagesSignal'
import { capabilitiesSignal } from '../context/CapabilitiesSignal'
import { resolveCapabilities } from '../context/capabilitiesCache'
import { bump } from '../context/RefreshSignal'
import { languageSignal } from '../i18n'
import { navItems, type ViewKey } from './Sidebar'
import PackageDetailModal, { type DetailTarget } from './PackageDetailModal'
import TypeBadge from './TypeBadge'
import { PackageIcon, SearchIcon } from './Icons'

interface Props {
  onNavigate: (view: ViewKey) => void
  /**
   * Initial value of the internal `open` state. App.tsx never passes this
   * (real usage is always Cmd+K-driven), so it exists purely so a Storybook
   * story can render the palette open without simulating a real keydown --
   * a simulated Cmd+K bubbles to `window`, which Storybook's own manager UI
   * also listens on globally for its own search shortcut, causing the
   * sidebar to reset/filter every time that story mounted.
   */
  defaultOpen?: boolean
}

type ResultRow =
  | {
      kind: 'nav'
      rowKey: string
      label: string
      icon: (p: { className?: string }) => VNode
      view: ViewKey
    }
  | { kind: 'package'; rowKey: string; label: string; name: string; isCask: boolean }

/**
 * Global Cmd+K command palette. Mounted once near the top of the app
 * (sibling to JobConsole/Toasts) so it's summonable from any view. Owns its
 * own open/query/detail state — it doesn't need to live in a shared context
 * since nothing else in the app needs to read or drive it.
 */
export default function CommandPalette({ onNavigate, defaultOpen = false }: Props) {
  const { t } = useTranslation()
  const open = useSignal(defaultOpen)
  const query = useSignal('')
  const activeIndex = useSignal(0)
  // Backed by the shared installed-packages cache (populated at app start
  // and kept fresh in the background), so the palette's package search is
  // warm on first open instead of fetching lazily every session.
  const packagesLoading = installedPackagesSignal.value.loading
  const detail = useSignal<DetailTarget | null>(null)
  const inputEl = useSignalRef<HTMLInputElement | null>(null)

  // Opening resets the transient state; the input is focused by the effect
  // below once the dialog is actually visible.
  function setOpen(next: boolean) {
    if (next && !open.peek()) {
      query.value = ''
      activeIndex.value = 0
    }
    open.value = next
  }

  // Global Cmd+K (or Ctrl+K where the platform has no Cmd key, see
  // Capabilities.hasCmdModifierKey) toggles the palette from anywhere;
  // Escape closes it. Reads open and capabilities at keypress time, so the
  // listener is attached once for the life of the component.
  useSignalEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const capabilities = resolveCapabilities(capabilitiesSignal.peek())
      if (isPrimaryShortcutModifierPressed(e, capabilities) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open.peek())
        return
      }
      if (e.key === 'Escape' && open.peek()) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useSignalEffect(() => {
    if (open.value) inputEl.peek()?.focus()
  })

  // Translated nav labels. Reads languageSignal so it recomputes on a
  // language switch: react-i18next's `t` keeps a stable reference across
  // switches, so it isn't a trigger on its own.
  const translatedNavItems = useComputed(() => {
    void languageSignal.value
    return visibleNavItems(navItems, resolveCapabilities(capabilitiesSignal.value)).map((item) => ({
      ...item,
      label: t(item.labelKey),
    }))
  })

  const results = useComputed<ResultRow[]>(() => {
    const navRows: ResultRow[] = filterNavItems(translatedNavItems.value, query.value).map((item) => ({
      kind: 'nav',
      rowKey: `nav:${item.key}`,
      label: item.label,
      icon: item.icon,
      view: item.key,
    }))
    const pkgRows: ResultRow[] = filterPackages(installedPackagesSignal.value.packages ?? [], query.value).map((p) => ({
      kind: 'package',
      rowKey: `pkg:${p.isCask ? 'cask' : 'formula'}:${p.name}`,
      label: p.name,
      name: p.name,
      isCask: p.isCask,
    }))
    return [...navRows, ...pkgRows]
  })

  function selectRow(row: ResultRow) {
    if (row.kind === 'nav') {
      onNavigate(row.view)
    } else {
      detail.value = { name: row.name, isCask: row.isCask }
    }
    setOpen(false)
  }

  function handleInputKeyDown(e: TargetedKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex.value = Math.max(activeIndex.value - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = results.value[activeIndex.value]
      if (row) selectRow(row)
    }
  }

  return (
    <>
      <dialog className={`modal ${open.value ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-lg p-0 overflow-hidden">
          <label className="input input-lg w-full rounded-none border-0 border-b border-base-300 focus-within:outline-none">
            <SearchIcon className="size-4 opacity-50" />
            <input
              ref={inputEl}
              type="text"
              placeholder={t('commandPalette.placeholder')}
              value={query.value}
              onChange={(e) => {
                query.value = e.currentTarget.value
                activeIndex.value = 0
              }}
              onKeyDown={handleInputKeyDown}
            />
          </label>
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.value.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-base-content/50">
                {packagesLoading ? t('commandPalette.loadingPackages') : t('commandPalette.noMatches')}
              </li>
            )}
            {results.value.map((row, i) => (
              <li key={row.rowKey}>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left ${
                    i === activeIndex.value ? 'bg-base-200' : 'hover:bg-base-200/60'
                  }`}
                  onMouseEnter={() => (activeIndex.value = i)}
                  onClick={() => selectRow(row)}
                >
                  {row.kind === 'nav' ? (
                    <row.icon className="size-4 shrink-0 opacity-70" />
                  ) : (
                    <PackageIcon className="size-4 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{row.label}</span>
                  {row.kind === 'package' && <TypeBadge isCask={row.isCask} size="xs" className="ml-auto shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => (open.value = false)}>close</button>
        </form>
      </dialog>

      <PackageDetailModal target={detail.value} onClose={() => (detail.value = null)} onChanged={bump} />
    </>
  )
}
