import { untracked, useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { SIZES, textSizeSignal } from '../context/TextSizeSignal'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { userDataSignal, useUserData } from '../context/UserDataContext'
import { supportedLngs } from '../i18n'
import { DownloadIcon, ImportIcon } from '../components/Icons'

// Language names in a language picker are conventionally shown in their own
// endonym (a French speaker sees "Français" whether the UI is currently in
// English or French) rather than translated -- so this map is intentionally
// separate from the i18n resource files. Extend it alongside `resources` in
// i18n/index.ts as new locales are added.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()

  const analytics = useSignal<string | null>(null)
  const analyticsLoading = useSignal(false)
  const analyticsBusy = useSignal<string | null>(null)

  // What the user has typed, if anything; until then the field shows the
  // saved value from user data.
  const appDirDraft = useSignal<string | null>(null)
  const appDir = useComputed(() => appDirDraft.value ?? userDataSignal.value?.settings?.caskAppDir ?? '')
  const appDirSaved = useSignal(false)

  const exportingData = useSignal(false)
  const importingData = useSignal(false)

  function loadAnalytics() {
    analyticsLoading.value = true
    api
      .analyticsState()
      .then((v) => (analytics.value = v))
      .catch((e) => (analytics.value = String(e)))
      .finally(() => (analyticsLoading.value = false))
  }

  useSignalEffect(() => untracked(loadAnalytics))

  async function analyticsToggle(enabled: boolean) {
    analyticsBusy.value = enabled ? 'on' : 'off'
    await runAction(() => api.analyticsSetEnabled(enabled))
    analyticsBusy.value = null
    loadAnalytics()
  }

  async function analyticsRegenerate() {
    analyticsBusy.value = 'regen'
    await runAction(() => api.analyticsRegenerateUUID())
    analyticsBusy.value = null
    loadAnalytics()
  }

  async function saveAppDir() {
    await api.setCaskAppDir(appDir.value.trim())
    userData.refresh()
    appDirSaved.value = true
    setTimeout(() => (appDirSaved.value = false), 2000)
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
    exportingData.value = true
    try {
      const path = await api.exportUserDataToFile()
      if (path) notify('success', t('settings.dataExportedToast', { path }))
    } catch (e) {
      notify('error', String(e))
    } finally {
      exportingData.value = false
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

    importingData.value = true
    try {
      await api.importUserDataFromFile(path)
      userData.refresh()
      notify('success', t('settings.dataImportedToast'))
    } catch (e) {
      notify('error', String(e))
    } finally {
      importingData.value = false
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
          {analyticsLoading.value ? (
            <div className="flex items-center gap-2 text-base-content/60 text-sm py-1">
              <span className="loading loading-spinner loading-xs" /> {t('settings.checking')}
            </div>
          ) : (
            <pre className="mockup-code text-xs mt-1">
              <code className="px-4">{analytics.value}</code>
            </pre>
          )}
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              className="btn btn-sm"
              disabled={analyticsBusy.value !== null}
              onClick={() => analyticsToggle(true)}
            >
              {analyticsBusy.value === 'on' && <span className="loading loading-spinner loading-xs" />}{' '}
              {t('settings.turnOn')}
            </button>
            <button
              className="btn btn-sm"
              disabled={analyticsBusy.value !== null}
              onClick={() => analyticsToggle(false)}
            >
              {analyticsBusy.value === 'off' && <span className="loading loading-spinner loading-xs" />}{' '}
              {t('settings.turnOff')}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={analyticsBusy.value !== null}
              onClick={analyticsRegenerate}
            >
              {analyticsBusy.value === 'regen' && <span className="loading loading-spinner loading-xs" />}{' '}
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
              value={appDir.value}
              onChange={(e) => (appDirDraft.value = e.currentTarget.value)}
            />
            <button className="btn btn-sm btn-primary" onClick={saveAppDir}>
              {appDirSaved.value ? t('common.saved') : t('common.save')}
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
                className={`btn btn-sm join-item ${textSizeSignal.value === s.key ? 'btn-primary' : ''}`}
                onClick={() => (textSizeSignal.value = s.key)}
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
            <button className="btn btn-sm" disabled={exportingData.value} onClick={exportData}>
              {exportingData.value ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              {t('settings.exportData')}
            </button>
            <button className="btn btn-sm" disabled={importingData.value} onClick={importData}>
              {importingData.value ? (
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
