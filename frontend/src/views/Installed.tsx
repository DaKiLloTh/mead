import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'
import { useInstalledPackages } from '../context/InstalledPackagesContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import PackageIcon from '../components/PackageIcon'
import { ArrowUpCircleIcon, PinIcon, RefreshIcon, SearchIcon, StarIcon, TrashIcon } from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask' | 'outdated' | 'favorites'

interface Props {
  refreshToken: number
  bump: () => void
}

function rowKey(p: BrewPackage) {
  return `${p.isCask ? 'c' : 'f'}:${p.name}`
}

export default function Installed({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()
  const { packages: cachedPkgs, loading, error, refresh: refreshPackages } = useInstalledPackages()
  const pkgs = cachedPkgs ?? []
  const [leaves, setLeaves] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  function loadLeaves() {
    api
      .leaves()
      .then((l) => setLeaves(new Set(l)))
      .catch(() => {})
  }

  useEffect(loadLeaves, [refreshToken])

  // Full reload of both the shared package cache and this view's own leaves
  // lookup — used by the error-retry button and by actions (pin/unpin) that
  // don't otherwise call `bump()`. Actions that do call `bump()` already get
  // the package cache refreshed via that shared signal (see App.tsx), so
  // they only need to refresh `leaves` themselves.
  function load() {
    refreshPackages()
    loadLeaves()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pkgs.filter((p) => {
      if (filter === 'formula' && p.isCask) return false
      if (filter === 'cask' && !p.isCask) return false
      if (filter === 'outdated' && !p.outdated) return false
      if (filter === 'favorites' && !userData.isFavorite(p.name, p.isCask)) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.fullName?.toLowerCase().includes(q) && !p.desc?.toLowerCase().includes(q)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgs, filter, query, userData.data])

  function toggleSelected(p: BrewPackage) {
    const key = rowKey(p)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(rowKey)))
    }
  }

  const selectedPkgs = filtered.filter((p) => selected.has(rowKey(p)))

  async function quickUninstall(p: BrewPackage) {
    const { ok, checked } = await confirm({
      title: t('installed.confirmUninstallTitle', { name: p.name }),
      body: t('installed.confirmUninstallBody'),
      danger: true,
      confirmLabel: t('common.uninstall'),
      checkboxes: p.isCask ? [{ label: t('installed.checkboxRemoveAppData') }] : [],
    })
    if (!ok) return
    setRowBusy(p.name)
    await runAction(() => api.uninstall(p.name, p.isCask, checked[0] ?? false))
    setRowBusy(null)
    loadLeaves()
    bump()
  }

  async function quickUpgrade(p: BrewPackage) {
    setRowBusy(p.name)
    await runAction(() => api.upgrade(p.name, p.isCask))
    setRowBusy(null)
    loadLeaves()
    bump()
  }

  async function bulkUninstall() {
    const anyCasks = selectedPkgs.some((p) => p.isCask)
    const { ok, checked } = await confirm({
      title: t('installed.confirmBulkUninstallTitle', { count: selectedPkgs.length }),
      body: selectedPkgs.map((p) => p.name).join(', '),
      danger: true,
      confirmLabel: t('installed.confirmBulkUninstallLabel'),
      checkboxes: anyCasks ? [{ label: t('installed.checkboxRemoveAppDataCasks') }] : [],
    })
    if (!ok) return
    const zap = checked[0] ?? false
    setBulkBusy(true)
    for (const p of selectedPkgs) {
      await runAction(() => api.uninstall(p.name, p.isCask, zap))
    }
    setBulkBusy(false)
    setSelected(new Set())
    loadLeaves()
    bump()
  }

  async function bulkUpgrade() {
    setBulkBusy(true)
    for (const p of selectedPkgs.filter((p) => p.outdated)) {
      await runAction(() => api.upgrade(p.name, p.isCask))
    }
    setBulkBusy(false)
    setSelected(new Set())
    loadLeaves()
    bump()
  }

  async function bulkPin() {
    setBulkBusy(true)
    for (const p of selectedPkgs.filter((p) => !p.isCask && !p.pinned)) {
      await runAction(() => api.pin(p.name))
    }
    setBulkBusy(false)
    setSelected(new Set())
    load()
  }

  const formulaCount = pkgs.filter((p) => !p.isCask).length
  const caskCount = pkgs.filter((p) => p.isCask).length
  const outdatedCount = pkgs.filter((p) => p.outdated).length
  const favoriteCount = pkgs.filter((p) => userData.isFavorite(p.name, p.isCask)).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('installed.title')}</h1>
          <p className="text-base-content/60 text-sm">
            {error ? t('installed.subtitleError') : t('installed.subtitleCount', { count: pkgs.length })}
          </p>
        </div>
        <label className="input input-sm w-64">
          <SearchIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder={t('installed.filterPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div role="tablist" className="tabs tabs-box tabs-sm w-fit">
          <button role="tab" className={`tab ${filter === 'all' ? 'tab-active' : ''}`} onClick={() => setFilter('all')}>
            {t('installed.tabAll', { count: pkgs.length })}
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'formula' ? 'tab-active' : ''}`}
            onClick={() => setFilter('formula')}
          >
            {t('installed.tabFormulae', { count: formulaCount })}
          </button>
          <button role="tab" className={`tab ${filter === 'cask' ? 'tab-active' : ''}`} onClick={() => setFilter('cask')}>
            {t('installed.tabCasks', { count: caskCount })}
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'outdated' ? 'tab-active' : ''}`}
            onClick={() => setFilter('outdated')}
          >
            {t('installed.tabOutdated', { count: outdatedCount })}
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'favorites' ? 'tab-active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            {t('installed.tabFavorites', { count: favoriteCount })}
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60">{t('installed.selectedCount', { count: selected.size })}</span>
            <button className="btn btn-xs" disabled={bulkBusy} onClick={bulkUpgrade}>
              {t('common.upgrade')}
            </button>
            <button className="btn btn-xs" disabled={bulkBusy} onClick={bulkPin}>
              {t('common.pin')}
            </button>
            <button className="btn btn-xs btn-error" disabled={bulkBusy} onClick={bulkUninstall}>
              {t('common.uninstall')}
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="alert alert-error alert-soft">
          <div>
            <div className="font-medium">{t('installed.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            <RefreshIcon className="size-4" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : loading && pkgs.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm table-fixed">
            <colgroup>
              <col className="w-8" />
              <col />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-56" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>{t('installed.colName')}</th>
                <th>{t('installed.colType')}</th>
                <th>{t('installed.colVersion')}</th>
                <th>{t('installed.colStatus')}</th>
                <th className="text-right">{t('installed.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const key = rowKey(p)
                const favorite = userData.isFavorite(p.name, p.isCask)
                return (
                  <tr key={key} className="hover:bg-base-200">
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={selected.has(key)}
                        onChange={() => toggleSelected(p)}
                      />
                    </td>
                    <td className="cursor-pointer" onClick={() => setDetail({ name: p.name, isCask: p.isCask })}>
                      <div className="font-medium flex items-center gap-1.5 min-w-0">
                        <PackageIcon name={p.name} isCask={p.isCask} className="size-5" />
                        {favorite && <StarIcon filled className="size-3.5 text-warning shrink-0" />}
                        <span className="truncate">{p.name}</span>
                      </div>
                      {p.desc && <div className="text-xs text-base-content/50 truncate">{p.desc}</div>}
                    </td>
                    <td>
                      <span className={`badge badge-sm badge-outline ${p.isCask ? 'badge-accent' : 'badge-primary'}`}>
                        {p.isCask ? t('common.cask') : t('common.formula')}
                      </span>
                    </td>
                    <td className="font-mono text-xs truncate" title={p.installedVersion || p.version}>
                      {p.installedVersion || p.version}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {p.outdated && <span className="badge badge-sm badge-warning">{t('common.badgeOutdated')}</span>}
                        {p.pinned && <span className="badge badge-sm badge-ghost">{t('common.badgePinned')}</span>}
                        {!p.isCask && leaves.has(p.name) && <span className="badge badge-sm badge-ghost">{t('installed.badgeLeaf')}</span>}
                        {!p.isCask && !p.linked && (
                          <span className="badge badge-sm badge-warning badge-outline">{t('common.badgeUnlinked')}</span>
                        )}
                        {p.isCask && p.autoUpdates && <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {p.outdated && (
                          <button
                            className="btn btn-xs btn-ghost text-warning"
                            disabled={rowBusy === p.name}
                            onClick={() => quickUpgrade(p)}
                            title={t('installed.upgradeTooltip')}
                          >
                            <ArrowUpCircleIcon className="size-4" />
                          </button>
                        )}
                        {!p.isCask && (
                          <button
                            className="btn btn-xs btn-ghost"
                            disabled={rowBusy === p.name}
                            onClick={async () => {
                              setRowBusy(p.name)
                              await runAction(() => (p.pinned ? api.unpin(p.name) : api.pin(p.name)))
                              setRowBusy(null)
                              load()
                            }}
                            title={p.pinned ? t('installed.unpinTooltip') : t('installed.pinTooltip')}
                          >
                            <PinIcon className="size-4" />
                          </button>
                        )}
                        <button
                          className="btn btn-xs btn-ghost text-error"
                          disabled={rowBusy === p.name}
                          onClick={() => quickUninstall(p)}
                          title={t('installed.uninstallTooltip')}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-base-content/50 py-8">
                    {t('installed.noMatches')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <PackageDetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          loadLeaves()
          bump()
        }}
      />
    </div>
  )
}
