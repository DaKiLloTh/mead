import { useEffect, useState } from 'preact/hooks'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'
import { supportedLngs } from '../i18n'
import { DownloadIcon, ImportIcon } from '../components/Icons'

const SIZES = [
  { key: 'sm', labelKey: 'settings.sizeSmall', scale: '14px' },
  { key: 'md', labelKey: 'settings.sizeDefault', scale: '16px' },
  { key: 'lg', labelKey: 'settings.sizeLarge', scale: '18px' },
  { key: 'xl', labelKey: 'settings.sizeExtraLarge', scale: '20px' },
] as const

type SizeKey = (typeof SIZES)[number]['key']

// Language names in a language picker are conventionally shown in their own
// endonym (a French speaker sees "Français" whether the UI is currently in
// English or French) rather than translated -- so this map is intentionally
// separate from the i18n resource files. Extend it alongside `resources` in
// i18n/index.ts as new locales are added.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
}

function getInitialSize(): SizeKey {
  const stored = localStorage.getItem('textSize') as SizeKey | null
  return stored && SIZES.some((s) => s.key === stored) ? stored : 'md'
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()

  const [analytics, setAnalytics] = useState<string | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsBusy, setAnalyticsBusy] = useState<string | null>(null)

  const [appDir, setAppDir] = useState('')
  const [appDirSaved, setAppDirSaved] = useState(false)

  const [size, setSize] = useState<SizeKey>(getInitialSize)

  const [exportingData, setExportingData] = useState(false)
  const [importingData, setImportingData] = useState(false)

  function loadAnalytics() {
    setAnalyticsLoading(true)
    api
      .analyticsState()
      .then(setAnalytics)
      .catch((e) => setAnalytics(String(e)))
      .finally(() => setAnalyticsLoading(false))
  }

  useEffect(loadAnalytics, [])

  useEffect(() => {
    setAppDir(userData.data?.settings?.caskAppDir ?? '')
  }, [userData.data])

  useEffect(() => {
    const found = SIZES.find((s) => s.key === size) ?? SIZES[1]
    document.documentElement.style.fontSize = found.scale
    localStorage.setItem('textSize', size)
  }, [size])

  async function analyticsToggle(enabled: boolean) {
    setAnalyticsBusy(enabled ? 'on' : 'off')
    await runAction(() => api.analyticsSetEnabled(enabled))
    setAnalyticsBusy(null)
    loadAnalytics()
  }

  async function analyticsRegenerate() {
    setAnalyticsBusy('regen')
    await runAction(() => api.analyticsRegenerateUUID())
    setAnalyticsBusy(null)
    loadAnalytics()
  }

  async function saveAppDir() {
    await api.setCaskAppDir(appDir.trim())
    userData.refresh()
    setAppDirSaved(true)
    setTimeout(() => setAppDirSaved(false), 2000)
  }

  async function clearAllData() {
    const { ok } = await confirm({
      title: t('settings.confirmClearAllTitle'),
      body: t('settings.confirmClearAllBody'),
      confirmLabel: t('settings.confirmClearAllLabel'),
      danger: true,
    })
    if (!ok) return
    await api.clearAllData()
    userData.refresh()
  }

  async function exportData() {
    setExportingData(true)
    try {
      const path = await api.exportUserDataToFile()
      if (path) notify('success', t('settings.dataExportedToast', { path }))
    } catch (e) {
      notify('error', String(e))
    } finally {
      setExportingData(false)
    }
  }

  async function importData() {
    const path = await api.pickUserDataFile()
    if (!path) return

    const { ok } = await confirm({
      title: t('settings.confirmImportTitle'),
      body: t('settings.confirmImportBody'),
      confirmLabel: t('settings.confirmImportLabel'),
      danger: true,
    })
    if (!ok) return

    setImportingData(true)
    try {
      await api.importUserDataFromFile(path)
      userData.refresh()
      notify('success', t('settings.dataImportedToast'))
    } catch (e) {
      notify('error', String(e))
    } finally {
      setImportingData(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t('settings.title')}</h1>
        <p className="text-base-content/60 text-sm">{t('settings.subtitle')}</p>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">{t('settings.privacyTitle')}</h2>
          <p className="text-sm text-base-content/70">{t('settings.privacyDescription')}</p>
          {analyticsLoading ? (
            <div className="flex items-center gap-2 text-base-content/60 text-sm py-1">
              <span className="loading loading-spinner loading-xs" /> {t('settings.checking')}
            </div>
          ) : (
            <pre className="mockup-code text-xs mt-1">
              <code className="px-4">{analytics}</code>
            </pre>
          )}
          <div className="flex flex-wrap gap-2 mt-1">
            <button className="btn btn-sm" disabled={analyticsBusy !== null} onClick={() => analyticsToggle(true)}>
              {analyticsBusy === 'on' && <span className="loading loading-spinner loading-xs" />} {t('settings.turnOn')}
            </button>
            <button className="btn btn-sm" disabled={analyticsBusy !== null} onClick={() => analyticsToggle(false)}>
              {analyticsBusy === 'off' && <span className="loading loading-spinner loading-xs" />}{' '}
              {t('settings.turnOff')}
            </button>
            <button className="btn btn-sm btn-ghost" disabled={analyticsBusy !== null} onClick={analyticsRegenerate}>
              {analyticsBusy === 'regen' && <span className="loading loading-spinner loading-xs" />}{' '}
              {t('settings.regenerateId')}
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">{t('settings.casksTitle')}</h2>
          <p className="text-sm text-base-content/70">
            <Trans i18nKey="settings.casksDescription" components={{ path: <span className="font-mono" /> } as any} />
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-sm flex-1"
              placeholder={t('settings.appDirPlaceholder')}
              value={appDir}
              onChange={(e) => setAppDir(e.currentTarget.value)}
            />
            <button className="btn btn-sm btn-primary" onClick={saveAppDir}>
              {appDirSaved ? t('common.saved') : t('common.save')}
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">{t('settings.languageTitle')}</h2>
          <p className="text-sm text-base-content/70">{t('settings.languageDescription')}</p>
          <select
            className="select select-sm w-fit"
            value={i18n.language}
            disabled={supportedLngs.length <= 1}
            onChange={(e) => void i18n.changeLanguage(e.currentTarget.value)}
          >
            {supportedLngs.map((lng) => (
              <option key={lng} value={lng}>
                {LANGUAGE_NAMES[lng] ?? lng}
              </option>
            ))}
          </select>
          {supportedLngs.length <= 1 && (
            <p className="text-xs text-base-content/50 mt-1">{t('settings.languageAutoHint')}</p>
          )}
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">{t('settings.appearanceTitle')}</h2>
          <p className="text-sm text-base-content/70">{t('settings.appearanceDescription')}</p>
          <div className="join w-fit">
            {SIZES.map((s) => (
              <button
                key={s.key}
                className={`btn btn-sm join-item ${size === s.key ? 'btn-primary' : ''}`}
                onClick={() => setSize(s.key)}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">{t('settings.dataTitle')}</h2>
          <p className="text-sm text-base-content/70">
            <Trans i18nKey="settings.dataDescription" components={{ path: <span className="font-mono" /> } as any} />
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => api.revealLocalDataFile()}>
              {t('settings.revealInFinder')}
            </button>
            <button className="btn btn-sm" disabled={exportingData} onClick={exportData}>
              {exportingData ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              {t('settings.exportData')}
            </button>
            <button className="btn btn-sm" disabled={importingData} onClick={importData}>
              {importingData ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <ImportIcon className="size-4" />
              )}
              {t('settings.importData')}
            </button>
            <button className="btn btn-sm btn-error btn-outline" onClick={clearAllData}>
              {t('settings.clearAllData')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
