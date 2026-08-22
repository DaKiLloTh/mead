import { useEffect, useMemo, useState } from 'react'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import { ArrowUpCircleIcon, PinIcon, SearchIcon, StarIcon, TrashIcon } from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask' | 'outdated' | 'favorites'

interface Props {
  refreshToken: number
  bump: () => void
}

function rowKey(p: BrewPackage) {
  return `${p.isCask ? 'c' : 'f'}:${p.name}`
}

export default function Installed({ refreshToken, bump }: Props) {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()
  const [pkgs, setPkgs] = useState<BrewPackage[]>([])
  const [leaves, setLeaves] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.listInstalled(), api.leaves().catch(() => [])])
      .then(([p, l]) => {
        setPkgs(p)
        setLeaves(new Set(l))
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pkgs.filter((p) => {
      if (filter === 'formula' && p.isCask) return false
      if (filter === 'cask' && !p.isCask) return false
      if (filter === 'outdated' && !p.outdated) return false
      if (filter === 'favorites' && !userData.isFavorite(p.name, p.isCask)) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.fullName?.toLowerCase().includes(q) && !p.desc?.toLowerCase().includes(q)) {
        return false
      }
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
    const ok = await confirm({
      title: `Uninstall ${p.name}?`,
      body: 'This removes the package from your system.',
      danger: true,
      confirmLabel: 'Uninstall',
    })
    if (!ok) return
    setRowBusy(p.name)
    await runAction(() => api.uninstall(p.name, p.isCask))
    setRowBusy(null)
    load()
    bump()
  }

  async function quickUpgrade(p: BrewPackage) {
    setRowBusy(p.name)
    await runAction(() => api.upgrade(p.name, p.isCask))
    setRowBusy(null)
    load()
    bump()
  }

  async function bulkUninstall() {
    const ok = await confirm({
      title: `Uninstall ${selectedPkgs.length} packages?`,
      body: selectedPkgs.map((p) => p.name).join(', '),
      danger: true,
      confirmLabel: 'Uninstall all',
    })
    if (!ok) return
    setBulkBusy(true)
    for (const p of selectedPkgs) {
      await runAction(() => api.uninstall(p.name, p.isCask))
    }
    setBulkBusy(false)
    setSelected(new Set())
    load()
    bump()
  }

  async function bulkUpgrade() {
    setBulkBusy(true)
    for (const p of selectedPkgs.filter((p) => p.outdated)) {
      await runAction(() => api.upgrade(p.name, p.isCask))
    }
    setBulkBusy(false)
    setSelected(new Set())
    load()
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
          <h1 className="text-2xl font-bold">Installed</h1>
          <p className="text-base-content/60 text-sm">{pkgs.length} packages installed</p>
        </div>
        <label className="input input-sm w-64">
          <SearchIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder="Filter installed…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div role="tablist" className="tabs tabs-box tabs-sm w-fit">
          <button role="tab" className={`tab ${filter === 'all' ? 'tab-active' : ''}`} onClick={() => setFilter('all')}>
            All ({pkgs.length})
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'formula' ? 'tab-active' : ''}`}
            onClick={() => setFilter('formula')}
          >
            Formulae ({formulaCount})
          </button>
          <button role="tab" className={`tab ${filter === 'cask' ? 'tab-active' : ''}`} onClick={() => setFilter('cask')}>
            Casks ({caskCount})
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'outdated' ? 'tab-active' : ''}`}
            onClick={() => setFilter('outdated')}
          >
            Outdated ({outdatedCount})
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'favorites' ? 'tab-active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            Favorites ({favoriteCount})
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60">{selected.size} selected</span>
            <button className="btn btn-xs" disabled={bulkBusy} onClick={bulkUpgrade}>
              Upgrade
            </button>
            <button className="btn btn-xs" disabled={bulkBusy} onClick={bulkPin}>
              Pin
            </button>
            <button className="btn btn-xs btn-error" disabled={bulkBusy} onClick={bulkUninstall}>
              Uninstall
            </button>
          </div>
        )}
      </div>

      {loading && pkgs.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
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
                      <div className="font-medium flex items-center gap-1.5">
                        {favorite && <StarIcon filled className="size-3.5 text-warning shrink-0" />}
                        {p.name}
                      </div>
                      {p.desc && <div className="text-xs text-base-content/50 truncate max-w-md">{p.desc}</div>}
                    </td>
                    <td>
                      <span className={`badge badge-sm badge-outline ${p.isCask ? 'badge-accent' : 'badge-primary'}`}>
                        {p.isCask ? 'cask' : 'formula'}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{p.installedVersion || p.version}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {p.outdated && <span className="badge badge-sm badge-warning">outdated</span>}
                        {p.pinned && <span className="badge badge-sm badge-ghost">pinned</span>}
                        {!p.isCask && leaves.has(p.name) && <span className="badge badge-sm badge-ghost">leaf</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {p.outdated && (
                          <button
                            className="btn btn-xs btn-ghost text-warning"
                            disabled={rowBusy === p.name}
                            onClick={() => quickUpgrade(p)}
                            title="Upgrade"
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
                            title={p.pinned ? 'Unpin' : 'Pin'}
                          >
                            <PinIcon className="size-4" />
                          </button>
                        )}
                        <button
                          className="btn btn-xs btn-ghost text-error"
                          disabled={rowBusy === p.name}
                          onClick={() => quickUninstall(p)}
                          title="Uninstall"
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
                    No packages match.
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
          load()
          bump()
        }}
      />
    </div>
  )
}
