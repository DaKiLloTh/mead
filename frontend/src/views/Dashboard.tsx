import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, SystemInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { ArrowUpCircleIcon, ExternalLinkIcon, RefreshIcon, WrenchIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import type { ViewKey } from '../components/Sidebar'

interface Props {
  onNavigate: (v: ViewKey) => void
  refreshToken: number
}

export default function Dashboard({ onNavigate, refreshToken }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .getSystemInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key)
    await runAction(action)
    setBusy(null)
    load()
  }

  if (!loading && error) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">{t('dashboard.title')}</h1>
        <div className="alert alert-error alert-soft mt-4">
          <div>
            <div className="font-medium">{t('dashboard.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
        <p className="text-sm text-base-content/70 mt-4">{t('dashboard.installHint')}</p>
        <pre className="mockup-code text-xs mt-2">
          <code className="px-4">
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
          </code>
        </pre>
        <div className="flex items-center gap-3 mt-3">
          <ExternalLink className="link inline-flex items-center gap-1 text-sm" href="https://brew.sh">
            brew.sh <ExternalLinkIcon className="size-3" />
          </ExternalLink>
          <button className="btn btn-sm" onClick={load}>
            <RefreshIcon className="size-4" /> {t('common.tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">{t('dashboard.title')}</h1>
      <p className="text-base-content/60 mb-6">{t('dashboard.subtitle')}</p>

      {loading && !info && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      )}

      {info && (
        <>
          <div className="stats shadow stats-vertical sm:stats-horizontal w-full bg-base-200 mb-6">
            <div className="stat cursor-pointer" onClick={() => onNavigate('installed')}>
              <div className="stat-title">{t('dashboard.statFormulaeInstalled')}</div>
              <div className="stat-value text-primary">{info.installedFormulaCount}</div>
            </div>
            <div className="stat cursor-pointer" onClick={() => onNavigate('installed')}>
              <div className="stat-title">{t('dashboard.statCasksInstalled')}</div>
              <div className="stat-value text-accent">{info.installedCaskCount}</div>
            </div>
            <div className="stat cursor-pointer" onClick={() => onNavigate('updates')}>
              <div className="stat-title">{t('dashboard.statOutdated')}</div>
              <div className="stat-value text-warning">{info.outdatedCount}</div>
              {info.outdatedCount > 0 && <div className="stat-desc">{t('dashboard.statOutdatedDesc')}</div>}
            </div>
          </div>

          <div className="card bg-base-200 mb-6">
            <div className="card-body">
              <h2 className="card-title text-base">{t('dashboard.quickActionsTitle')}</h2>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy !== null}
                  onClick={() => run('update', () => api.update())}
                >
                  {busy === 'update' ? <span className="loading loading-spinner loading-xs" /> : <RefreshIcon className="size-4" />}
                  {t('dashboard.updateHomebrew')}
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
                  {t('common.upgradeAll')}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() => run('doctor', () => api.doctor())}
                >
                  {busy === 'doctor' ? <span className="loading loading-spinner loading-xs" /> : <WrenchIcon className="size-4" />}
                  {t('dashboard.runDoctor')}
                </button>
              </div>
            </div>
          </div>

          <div className="card bg-base-200 mb-6">
            <div className="card-body">
              <h2 className="card-title text-base">{t('dashboard.healthTitle')}</h2>
              <div className="stats stats-vertical sm:stats-horizontal bg-transparent">
                <div
                  className="stat px-0 pr-6 cursor-pointer"
                  onClick={() => onNavigate('installed')}
                  title={t('dashboard.deprecatedTooltip')}
                >
                  <div className="stat-title">{t('dashboard.deprecated')}</div>
                  <div className={`stat-value text-lg ${info.deprecatedCount > 0 ? 'text-warning' : ''}`}>
                    {info.deprecatedCount}
                  </div>
                </div>
                <div
                  className="stat px-0 pr-6 cursor-pointer"
                  onClick={() => onNavigate('installed')}
                  title={t('dashboard.disabledTooltip')}
                >
                  <div className="stat-title">{t('dashboard.disabled')}</div>
                  <div className={`stat-value text-lg ${info.disabledCount > 0 ? 'text-error' : ''}`}>
                    {info.disabledCount}
                  </div>
                </div>
                <div
                  className="stat px-0 cursor-pointer"
                  onClick={() => onNavigate('installed')}
                  title={t('dashboard.pinnedTooltip')}
                >
                  <div className="stat-title">{t('dashboard.pinned')}</div>
                  <div className="stat-value text-lg">{info.pinnedCount}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="card bg-base-200">
              <div className="card-body py-4">
                <h3 className="font-medium text-xs uppercase text-base-content/50">{t('dashboard.homebrewSectionTitle')}</h3>
                <div className="font-mono text-xs mt-1 break-all">{info.brewVersion}</div>
                <div className="font-mono text-xs text-base-content/50 break-all">{info.brewPath}</div>
              </div>
            </div>
            <div className="card bg-base-200">
              <div className="card-body py-4">
                <h3 className="font-medium text-xs uppercase text-base-content/50">{t('dashboard.prefixSectionTitle')}</h3>
                <div className="font-mono text-xs mt-1 break-all">{info.prefix}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
