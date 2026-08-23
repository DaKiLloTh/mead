import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, SystemInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { ArrowUpCircleIcon, ExternalLinkIcon, RefreshIcon, WrenchIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import type { ViewKey } from '../components/Sidebar'
import type { Filter as InstalledFilter } from './Installed'

interface Props {
  onNavigate: (v: ViewKey) => void
  onNavigateInstalled: (filter?: InstalledFilter) => void
  refreshToken: number
}

export default function Dashboard({ onNavigate, onNavigateInstalled, refreshToken }: Props) {
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
            <div className="card-body py-3">
              <h3 className="font-medium text-xs uppercase text-base-content/50">{t('dashboard.healthTitle')}</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  className="btn btn-sm btn-ghost justify-start gap-2"
                  onClick={() => onNavigateInstalled('deprecated')}
                  title={t('dashboard.deprecatedTooltip')}
                >
                  <span className={`font-mono font-semibold ${info.deprecatedCount > 0 ? 'text-warning' : 'text-base-content/60'}`}>
                    {info.deprecatedCount}
                  </span>
                  {t('dashboard.deprecated')}
                </button>
                <button
                  className="btn btn-sm btn-ghost justify-start gap-2"
                  onClick={() => onNavigateInstalled('disabled')}
                  title={t('dashboard.disabledTooltip')}
                >
                  <span className={`font-mono font-semibold ${info.disabledCount > 0 ? 'text-error' : 'text-base-content/60'}`}>
                    {info.disabledCount}
                  </span>
                  {t('dashboard.disabled')}
                </button>
                <button
                  className="btn btn-sm btn-ghost justify-start gap-2"
                  onClick={() => onNavigateInstalled('pinned')}
                  title={t('dashboard.pinnedTooltip')}
                >
                  <span className="font-mono font-semibold text-base-content/60">{info.pinnedCount}</span>
                  {t('dashboard.pinned')}
                </button>
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
