import { untracked, useSignal, useSignalEffect } from '@preact/signals'
import { useTranslation } from 'react-i18next'
import { api, MenuBarStatus } from '../lib/api'
import ErrorAlert from './ErrorAlert'

// Settings card for the menu bar companion (cmd/mead-mon, see
// internal/menubar). Hidden in builds that don't bundle it, such as
// `wails dev` and Linux.
export default function MenuBarSetting() {
  const { t } = useTranslation()
  const status = useSignal<MenuBarStatus | null>(null)
  const busy = useSignal(false)
  const error = useSignal<string | null>(null)

  function load() {
    api
      .menuBarStatus()
      .then((s) => (status.value = s))
      .catch(() => (status.value = null))
  }

  useSignalEffect(() => untracked(load))

  async function toggle(on: boolean) {
    busy.value = true
    error.value = null
    try {
      await api.setMenuBarEnabled(on)
    } catch (e) {
      error.value = String(e)
    } finally {
      busy.value = false
      load()
    }
  }

  if (!status.value?.available) return null

  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h2 className="card-title text-base">{t('settings.menuBarTitle')}</h2>
        <p className="text-sm text-base-content/70">{t('settings.menuBarDescription')}</p>
        <label className="label cursor-pointer w-fit gap-3">
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={status.value.enabled}
            disabled={busy.value}
            onChange={(e) => toggle(e.currentTarget.checked)}
          />
          <span className="text-sm">{t('settings.menuBarToggle')}</span>
        </label>
        {error.value && (
          <ErrorAlert title={t('settings.menuBarFailedTitle')} message={error.value} className="text-sm" />
        )}
      </div>
    </div>
  )
}
