import { useEffect, useMemo, useState } from 'react'
import { api, OutdatedPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useUserData } from '../context/UserDataContext'
import { ArrowUpCircleIcon, ClockIcon, RefreshIcon } from '../components/Icons'

interface Props {
  refreshToken: number
  bump: () => void
}

const SNOOZE_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
]

export default function Updates({ refreshToken, bump }: Props) {
  const { runAction } = useJobs()
  const userData = useUserData()
  const [items, setItems] = useState<OutdatedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [upgradingAll, setUpgradingAll] = useState(false)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [greedy, setGreedy] = useState(false)

  function load() {
    setLoading(true)
    api
      .outdated(greedy)
      .then(setItems)
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken, greedy])

  const { visible, snoozed } = useMemo(() => {
    const visible: OutdatedPackage[] = []
    const snoozed: OutdatedPackage[] = []
    for (const p of items) {
      if (userData.snoozedUntil(p.name, p.isCask)) {
        snoozed.push(p)
      } else {
        visible.push(p)
      }
    }
    return { visible, snoozed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, userData.data])

  async function upgradeOne(p: OutdatedPackage) {
    setRowBusy(p.name)
    await runAction(() => api.upgrade(p.name, p.isCask))
    setRowBusy(null)
    load()
    bump()
  }

  async function upgradeAll() {
    setUpgradingAll(true)
    await runAction(() => api.upgradeAll(greedy))
    setUpgradingAll(false)
    load()
    bump()
  }

  const list = showSnoozed ? snoozed : visible

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Updates</h1>
          <p className="text-base-content/60 text-sm">
            {visible.length === 0
              ? 'Everything is up to date.'
              : `${visible.length} package${visible.length === 1 ? '' : 's'} can be upgraded`}
            {snoozed.length > 0 && ` · ${snoozed.length} snoozed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="label cursor-pointer gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={greedy}
              onChange={(e) => setGreedy(e.target.checked)}
            />
            <span className="label-text">Include auto-updating casks</span>
          </label>
          {snoozed.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setShowSnoozed((s) => !s)}>
              <ClockIcon className="size-4" /> {showSnoozed ? 'Show active' : `Show snoozed (${snoozed.length})`}
            </button>
          )}
          <button className="btn btn-sm" disabled={loading} onClick={load}>
            <RefreshIcon className="size-4" /> Refresh
          </button>
          {!showSnoozed && visible.length > 0 && (
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
      ) : list.length === 0 ? (
        <div className="text-center text-base-content/50 py-16">
          <div className="text-4xl mb-2">✓</div>
          {showSnoozed ? 'Nothing snoozed.' : 'Nothing to update.'}
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
              {list.map((p) => (
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
                    <div className="flex justify-end gap-1">
                      {showSnoozed ? (
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => userData.unsnooze(p.name, p.isCask)}
                        >
                          Unsnooze
                        </button>
                      ) : p.pinned ? (
                        <span className="badge badge-ghost badge-sm">pinned</span>
                      ) : (
                        <>
                          <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="btn btn-xs btn-ghost" title="Snooze">
                              <ClockIcon className="size-3.5" />
                            </div>
                            <ul tabIndex={0} className="dropdown-content menu menu-sm bg-base-100 rounded-box z-10 w-32 p-1 shadow border border-base-300">
                              {SNOOZE_OPTIONS.map((o) => (
                                <li key={o.days}>
                                  <a onClick={() => userData.snooze(p.name, p.isCask, o.days)}>{o.label}</a>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <button
                            className="btn btn-xs btn-primary"
                            disabled={rowBusy === p.name}
                            onClick={() => upgradeOne(p)}
                          >
                            {rowBusy === p.name ? <span className="loading loading-spinner loading-xs" /> : 'Upgrade'}
                          </button>
                        </>
                      )}
                    </div>
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
