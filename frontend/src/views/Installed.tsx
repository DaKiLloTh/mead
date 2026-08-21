import { useEffect, useMemo, useState } from 'react'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import { ArrowUpCircleIcon, PinIcon, SearchIcon, TrashIcon } from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask' | 'outdated'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Installed({ refreshToken, bump }: Props) {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const [pkgs, setPkgs] = useState<BrewPackage[]>([])
  const [leaves, setLeaves] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

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
      if (q && !p.name.toLowerCase().includes(q) && !p.fullName?.toLowerCase().includes(q) && !p.desc?.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [pkgs, filter, query])

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

  const formulaCount = pkgs.filter((p) => !p.isCask).length
  const caskCount = pkgs.filter((p) => p.isCask).length
  const outdatedCount = pkgs.filter((p) => p.outdated).length

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

      <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
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
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={`${p.isCask ? 'cask' : 'formula'}:${p.name}`} className="hover:bg-base-200">
                  <td className="cursor-pointer" onClick={() => setDetail({ name: p.name, isCask: p.isCask })}>
                    <div className="font-medium">{p.name}</div>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-base-content/50 py-8">
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
