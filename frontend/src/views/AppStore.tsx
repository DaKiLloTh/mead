import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { api, MasApp } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { ArrowUpCircleIcon, DownloadIcon, RefreshIcon, StoreIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import PackageIcon from '../components/PackageIcon'

export default function AppStore() {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [apps, setApps] = useState<MasApp[]>([])
  const [outdated, setOutdated] = useState<MasApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [installingMas, setInstallingMas] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    api
      .masAvailable()
      .then(async (ok) => {
        setAvailable(ok)
        if (!ok) return
        const [list, out] = await Promise.all([api.masList(), api.masOutdated()])
        setApps(list)
        setOutdated(out)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function installMas() {
    setInstallingMas(true)
    await runAction(() => api.install('mas', false))
    setInstallingMas(false)
    load()
  }

  async function upgrade(id: string) {
    setRowBusy(id)
    await runAction(() => api.masUpgrade(id))
    setRowBusy(null)
    load()
  }

  const outdatedIds = new Set(outdated.map((o) => o.id))

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">{t('appstore.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">
        <Trans i18nKey="appstore.subtitle" components={{ cli: <span className="font-mono" /> }} />
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" />{' '}
          <Trans i18nKey="appstore.checkingForMas" components={{ cli: <span className="font-mono" /> }} />
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-error alert-soft">
          <div>
            <div className="font-medium">{t('appstore.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            <RefreshIcon className="size-4" /> {t('common.tryAgain')}
          </button>
        </div>
      )}

      {!loading && !error && available === false && (
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-base">
              <StoreIcon className="size-5" />{' '}
              <Trans i18nKey="appstore.installMasTitle" components={{ cli: <span className="font-mono" /> }} />
            </h2>
            <p className="text-sm text-base-content/70">
              <Trans
                i18nKey="appstore.installMasDescription"
                components={{ link: <ExternalLink className="link" href="https://github.com/mas-cli/mas">mas</ExternalLink> }}
              />
            </p>
            <div className="card-actions mt-2">
              <button className="btn btn-sm btn-primary" disabled={installingMas} onClick={installMas}>
                {installingMas ? <span className="loading loading-spinner loading-xs" /> : <DownloadIcon className="size-4" />}
                {t('appstore.installMasButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && available && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-base-content/60">
              {t('appstore.countsSummary', { appCount: apps.length, outdatedCount: outdated.length })}
            </p>
            {outdated.length > 0 && (
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  await runAction(() => api.masUpgradeAll())
                  load()
                }}
              >
                <ArrowUpCircleIcon className="size-4" /> {t('common.upgradeAll')}
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm table-fixed">
              <colgroup>
                <col />
                <col className="w-56" />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('appstore.colName')}</th>
                  <th>{t('appstore.colVersion')}</th>
                  <th className="text-right">{t('appstore.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id} className="hover:bg-base-200">
                    <td className="font-medium">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <PackageIcon name={app.name} isCask={false} isMas className="size-5" />
                        <span className="truncate">{app.name}</span>
                      </div>
                    </td>
                    <td className="font-mono text-xs wrap-break-word">
                      {app.installedVersion}
                      {outdatedIds.has(app.id) && (
                        <>
                          {' '}
                          → <span className="text-warning">{outdated.find((o) => o.id === app.id)?.latestVersion}</span>
                        </>
                      )}
                    </td>
                    <td className="text-right">
                      {outdatedIds.has(app.id) && (
                        <button className="btn btn-xs btn-primary" disabled={rowBusy === app.id} onClick={() => upgrade(app.id)}>
                          {rowBusy === app.id ? <span className="loading loading-spinner loading-xs" /> : t('common.upgrade')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-base-content/50 py-8">
                      {t('appstore.noApps')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
