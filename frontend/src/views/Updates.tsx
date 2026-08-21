import { useEffect, useState } from 'react'
import { api, OutdatedPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { ArrowUpCircleIcon, RefreshIcon } from '../components/Icons'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Updates({ refreshToken, bump }: Props) {
  const { runAction } = useJobs()
  const [items, setItems] = useState<OutdatedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [upgradingAll, setUpgradingAll] = useState(false)

  function load() {
    setLoading(true)
    api
      .outdated()
      .then(setItems)
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  async function upgradeOne(p: OutdatedPackage) {
    setRowBusy(p.name)
    await runAction(() => api.upgrade(p.name, p.isCask))
    setRowBusy(null)
    load()
    bump()
  }

  async function upgradeAll() {
    setUpgradingAll(true)
    await runAction(() => api.upgradeAll())
    setUpgradingAll(false)
    load()
    bump()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Updates</h1>
          <p className="text-base-content/60 text-sm">
            {items.length === 0 ? 'Everything is up to date.' : `${items.length} package${items.length === 1 ? '' : 's'} can be upgraded`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm" disabled={loading} onClick={load}>
            <RefreshIcon className="size-4" /> Refresh
          </button>
          {items.length > 0 && (
            <button className="btn btn-sm btn-primary" disabled={upgradingAll} onClick={upgradeAll}>
              {upgradingAll ? <span className="loading loading-spinner loading-xs" /> : <ArrowUpCircleIcon className="size-4" />}
              Upgrade all
            </button>
          )}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> Checking for updates…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-base-content/50 py-16">
          <div className="text-4xl mb-2">✓</div>
          Nothing to update.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Installed</th>
                <th>Latest</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={`${p.isCask ? 'c' : 'f'}:${p.name}`} className="hover:bg-base-200">
                  <td className="font-medium">{p.name}</td>
                  <td>
                    <span className={`badge badge-sm badge-outline ${p.isCask ? 'badge-accent' : 'badge-primary'}`}>
                      {p.isCask ? 'cask' : 'formula'}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{p.installedVersions.join(', ')}</td>
                  <td className="font-mono text-xs text-warning">{p.currentVersion}</td>
                  <td className="text-right">
                    {p.pinned ? (
                      <span className="badge badge-ghost badge-sm">pinned</span>
                    ) : (
                      <button
                        className="btn btn-xs btn-primary"
                        disabled={rowBusy === p.name}
                        onClick={() => upgradeOne(p)}
                      >
                        {rowBusy === p.name ? <span className="loading loading-spinner loading-xs" /> : 'Upgrade'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
