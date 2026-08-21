import { useEffect, useState } from 'react'
import { api, SystemInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { ArrowUpCircleIcon, RefreshIcon, WrenchIcon } from '../components/Icons'
import type { ViewKey } from '../components/Sidebar'

interface Props {
  onNavigate: (v: ViewKey) => void
  refreshToken: number
}

export default function Dashboard({ onNavigate, refreshToken }: Props) {
  const { runAction } = useJobs()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .getSystemInfo()
      .then(setInfo)
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key)
    await runAction(action)
    setBusy(null)
    load()
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-base-content/60 mb-6">A quick look at your Homebrew installation.</p>

      {loading && !info && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> Loading…
        </div>
      )}

      {info && (
        <>
          <div className="stats shadow stats-vertical sm:stats-horizontal w-full bg-base-200 mb-6">
            <div className="stat cursor-pointer" onClick={() => onNavigate('installed')}>
              <div className="stat-title">Formulae installed</div>
              <div className="stat-value text-primary">{info.installedFormulaCount}</div>
            </div>
            <div className="stat cursor-pointer" onClick={() => onNavigate('installed')}>
              <div className="stat-title">Casks installed</div>
              <div className="stat-value text-accent">{info.installedCaskCount}</div>
            </div>
            <div className="stat cursor-pointer" onClick={() => onNavigate('updates')}>
              <div className="stat-title">Outdated</div>
              <div className="stat-value text-warning">{info.outdatedCount}</div>
              {info.outdatedCount > 0 && <div className="stat-desc">Click to review &amp; upgrade</div>}
            </div>
          </div>

          <div className="card bg-base-200 mb-6">
            <div className="card-body">
              <h2 className="card-title text-base">Quick actions</h2>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy !== null}
                  onClick={() => run('update', () => api.update())}
                >
                  {busy === 'update' ? <span className="loading loading-spinner loading-xs" /> : <RefreshIcon className="size-4" />}
                  Update Homebrew
                </button>
                <button
                  className="btn btn-sm btn-warning"
                  disabled={busy !== null || info.outdatedCount === 0}
                  onClick={() => run('upgrade', () => api.upgradeAll())}
                >
                  {busy === 'upgrade' ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <ArrowUpCircleIcon className="size-4" />
                  )}
                  Upgrade all
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() => run('doctor', () => api.doctor())}
                >
                  {busy === 'doctor' ? <span className="loading loading-spinner loading-xs" /> : <WrenchIcon className="size-4" />}
                  Run doctor
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="card bg-base-200">
              <div className="card-body py-4">
                <h3 className="font-medium text-xs uppercase text-base-content/50">Homebrew</h3>
                <div className="font-mono text-xs mt-1 break-all">{info.brewVersion}</div>
                <div className="font-mono text-xs text-base-content/50 break-all">{info.brewPath}</div>
              </div>
            </div>
            <div className="card bg-base-200">
              <div className="card-body py-4">
                <h3 className="font-medium text-xs uppercase text-base-content/50">Prefix</h3>
                <div className="font-mono text-xs mt-1 break-all">{info.prefix}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
