import { useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { servicesSignal, ensureServicesLoaded, loadServices } from '../context/ServicesSignal'
import { PlayIcon, RefreshIcon, SquareIcon } from '../components/Icons'

interface Props {
  refreshToken: number
  bump: () => void
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'started') return 'badge-success'
  if (s === 'error') return 'badge-error'
  if (s === 'stopped' || s === 'none') return 'badge-ghost'
  return 'badge-info'
}

export default function Services({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const { services, loading, error } = servicesSignal.value
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)

  // ensureServicesLoaded() is idempotent: if Sidebar's onMouseEnter already
  // kicked off a fetch before this view even mounted, this is a no-op and
  // the data that comes back is whatever that fetch returns. loadServices()
  // below is the separate, always-real-fetch path for refreshToken changes
  // after the initial mount, since those mean something else in the app
  // changed and this view genuinely needs fresh data, not whatever's cached.
  useEffect(() => {
    ensureServicesLoaded()
  }, [])

  const skipFirstRefreshRef = useRef(true)
  useEffect(() => {
    if (skipFirstRefreshRef.current) {
      skipFirstRefreshRef.current = false
      return
    }
    loadServices()
  }, [refreshToken])

  async function act(name: string, action: () => Promise<string>) {
    setRowBusy(name)
    await runAction(action)
    setRowBusy(null)
    loadServices()
    bump()
  }

  async function cleanup() {
    setCleaningUp(true)
    await runAction(() => api.servicesCleanup())
    setCleaningUp(false)
    loadServices()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{t('services.title')}</h1>
          <p className="text-base-content/60 text-sm">{t('services.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-sm" disabled={cleaningUp} onClick={cleanup}>
            {cleaningUp && <span className="loading loading-spinner loading-xs" />} {t('services.cleanUpUnused')}
          </button>
          <button className="btn btn-sm" disabled={loading} onClick={loadServices}>
            <RefreshIcon className="size-4" /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error alert-soft text-sm mb-4">{error}</div>}

      {loading && services.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      ) : services.length === 0 && !error ? (
        <div className="text-center text-base-content/50 py-16">{t('services.noServices')}</div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm table-fixed">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-20" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('services.colName')}</th>
                <th>{t('services.colStatus')}</th>
                <th>{t('services.colUser')}</th>
                <th>{t('services.colPid')}</th>
                <th className="text-right">{t('services.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.name} className="hover:bg-base-200">
                  <td className="font-medium truncate">{s.name}</td>
                  <td>
                    <span className={`badge badge-sm ${statusBadge(s.status)}`}>{s.status}</span>
                  </td>
                  <td className="text-xs text-base-content/60 truncate" title={s.user}>
                    {s.user}
                  </td>
                  <td className="font-mono text-xs truncate">{s.pid || '-'}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {s.running ? (
                        <button
                          className="btn btn-xs btn-ghost"
                          disabled={rowBusy === s.name}
                          onClick={() => act(s.name, () => api.serviceStop(s.name))}
                          title={t('services.stopTooltip')}
                        >
                          <SquareIcon className="size-4" />
                        </button>
                      ) : (
                        <button
                          className="btn btn-xs btn-ghost text-success"
                          disabled={rowBusy === s.name}
                          onClick={() => act(s.name, () => api.serviceStart(s.name))}
                          title={t('services.startTooltip')}
                        >
                          <PlayIcon className="size-4" />
                        </button>
                      )}
                      <button
                        className="btn btn-xs btn-ghost"
                        disabled={rowBusy === s.name}
                        onClick={() => act(s.name, () => api.serviceRestart(s.name))}
                        title={t('services.restartTooltip')}
                      >
                        <RefreshIcon className="size-4" />
                      </button>
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
