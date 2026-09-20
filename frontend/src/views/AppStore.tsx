import { useEffect, useState } from 'preact/hooks'
import { Trans, useTranslation } from 'react-i18next'
import { api, type TouchIDStatus } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { appStoreSignal, ensureAppStoreLoaded, loadAppStore } from '../context/AppStoreSignal'
import { ArrowUpCircleIcon, DownloadIcon, ExternalLinkIcon, StoreIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import PackageIcon from '../components/PackageIcon'
import { appStoreUrl } from '../lib/appStoreUrl'
import TableShell from '../components/TableShell'
import LoadingRow from '../components/LoadingRow'
import TouchIdBanner from '../components/TouchIdBanner'
import ErrorAlert from '../components/ErrorAlert'

// How often, and for how long, to check whether the Terminal window finished.
const TOUCH_ID_POLL_MS = 2000
const TOUCH_ID_WAIT_MS = 5 * 60 * 1000

export default function AppStore() {
  const { t } = useTranslation()
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const { available, apps, outdated, loading, error } = appStoreSignal.value
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [installingMas, setInstallingMas] = useState(false)
  const [upgradingAll, setUpgradingAll] = useState(false)
  const [touchId, setTouchId] = useState<TouchIDStatus | null>(null)
  const [awaitingTouchId, setAwaitingTouchId] = useState(false)

  function loadTouchIdStatus() {
    api
      .touchIDSudoStatus()
      .then(setTouchId)
      .catch(() => {})
  }

  // Idempotent: a no-op if Sidebar's onMouseEnter already started this
  // fetch before the view mounted. mas is the slowest CLI this app shells
  // out to, so the hover head-start matters more here than most views.
  useEffect(() => {
    ensureAppStoreLoaded()
    loadTouchIdStatus()
  }, [])

  async function installMas() {
    setInstallingMas(true)
    await runAction(() => api.install('mas', false))
    setInstallingMas(false)
    loadAppStore()
  }

  // Only ever runs from an explicit click plus a confirm: this edits a
  // system-wide security setting (sudo's PAM config), so mead never does it
  // silently. The write happens in a Terminal window the user types their
  // password into (macOS blocks mead from writing /etc/pam.d itself), so this
  // only opens it, then polls until the setting shows up.
  async function enableTouchId() {
    const { ok } = await confirm({
      title: t('appstore.touchIdConfirmTitle'),
      body: t('appstore.touchIdConfirmBody'),
      confirmLabel: t('appstore.touchIdConfirmLabel'),
    })
    if (!ok) return
    try {
      await api.startTouchIDSudoSetup()
      setAwaitingTouchId(true)
    } catch (e) {
      notify('error', String(e))
    }
  }

  useEffect(() => {
    if (!awaitingTouchId) return
    const started = Date.now()
    const timer = setInterval(async () => {
      try {
        const status = await api.touchIDSudoStatus()
        setTouchId(status)
        if (status.enabled) {
          setAwaitingTouchId(false)
          notify('success', t('appstore.touchIdEnabledToast'))
        }
      } catch {
        // keep polling; a transient failure shouldn't end the wait early
      }
      if (Date.now() - started > TOUCH_ID_WAIT_MS) setAwaitingTouchId(false)
    }, TOUCH_ID_POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingTouchId])

  // If mas needs sudo partway through (Xcode's App Store delivery pipeline
  // is the known case), the backend job runs with a controlling pty, so sudo
  // prompts normally: a Touch ID sheet if enabled (see the banner above),
  // otherwise a "Password:" line in the job console with an input box.
  // Nothing for this view to catch or retry.
  async function upgrade(id: string) {
    setRowBusy(id)
    await runAction(() => api.masUpgrade(id))
    setRowBusy(null)
    loadAppStore()
  }

  async function upgradeAll() {
    setUpgradingAll(true)
    await runAction(() => api.masUpgradeAll())
    setUpgradingAll(false)
    loadAppStore()
  }

  const outdatedIds = new Set(outdated.map((o) => o.id))

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">{t('appstore.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">
        <Trans i18nKey="appstore.subtitle" components={{ cli: <span className="font-mono" /> } as any} />
      </p>

      {loading && (
        <LoadingRow>
          <Trans i18nKey="appstore.checkingForMas" components={{ cli: <span className="font-mono" /> } as any} />
        </LoadingRow>
      )}

      {!loading && error && <ErrorAlert title={t('appstore.errorTitle')} message={error} onRetry={loadAppStore} />}

      {!loading && !error && available === false && (
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-base">
              <StoreIcon className="size-5" />{' '}
              <Trans i18nKey="appstore.installMasTitle" components={{ cli: <span className="font-mono" /> } as any} />
            </h2>
            <p className="text-sm text-base-content/70">
              <Trans
                i18nKey="appstore.installMasDescription"
                components={
                  {
                    link: (
                      <ExternalLink className="link" href="https://github.com/mas-cli/mas">
                        mas
                      </ExternalLink>
                    ),
                  } as any
                }
              />
            </p>
            <div className="card-actions mt-2">
              <button className="btn btn-sm btn-primary" disabled={installingMas} onClick={installMas}>
                {installingMas ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <DownloadIcon className="size-4" />
                )}
                {t('appstore.installMasButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && available && (
        <>
          {touchId?.available && !touchId.enabled && (
            <TouchIdBanner waiting={awaitingTouchId} onEnable={enableTouchId} />
          )}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-base-content/60">
              {t('appstore.countsSummary', { appCount: apps.length, outdatedCount: outdated.length })}
            </p>
            {outdated.length > 0 && (
              <button className="btn btn-sm btn-primary" disabled={upgradingAll} onClick={upgradeAll}>
                {upgradingAll ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <ArrowUpCircleIcon className="size-4" />
                )}
                {t('common.upgradeAll')}
              </button>
            )}
          </div>

          <TableShell colgroup={[<col />, <col className="w-56" />, <col className="w-28" />]}>
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
                    <div className="flex justify-end gap-1">
                      {appStoreUrl(app.id) && (
                        <ExternalLink
                          href={appStoreUrl(app.id)!}
                          className="btn btn-xs btn-ghost btn-square"
                          title={t('appstore.openInAppStore')}
                        >
                          <ExternalLinkIcon className="size-3.5" />
                        </ExternalLink>
                      )}
                      {outdatedIds.has(app.id) && (
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={rowBusy === app.id}
                          onClick={() => upgrade(app.id)}
                        >
                          {rowBusy === app.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            t('common.upgrade')
                          )}
                        </button>
                      )}
                    </div>
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
          </TableShell>
        </>
      )}
    </div>
  )
}
