import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, HistoryEntry } from '../lib/api'
import { useConfirm } from '../context/ConfirmContext'
import { CheckIcon, ClockIcon, TrashIcon, XIcon } from '../components/Icons'

export default function History() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  function load() {
    api.getUserData().then((d) => setEntries(d.history ?? []))
  }

  useEffect(load, [])

  async function clear() {
    const { ok } = await confirm({ title: t('history.confirmClearTitle'), confirmLabel: t('history.confirmClearLabel'), danger: true })
    if (!ok) return
    await api.clearHistory()
    load()
  }

  const sorted = [...(entries ?? [])].reverse()

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{t('history.title')}</h1>
          <p className="text-base-content/60 text-sm">{t('history.subtitle')}</p>
        </div>
        {sorted.length > 0 && (
          <button className="btn btn-sm btn-ghost text-error" onClick={clear}>
            <TrashIcon className="size-4" /> {t('history.clearButton')}
          </button>
        )}
      </div>

      {entries === null ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center text-base-content/50 py-16">
          <ClockIcon className="size-8 mx-auto mb-2 opacity-40" />
          {t('history.noActivity')}
        </div>
      ) : (
        <ul className="timeline timeline-vertical timeline-compact">
          {sorted.map((e, i) => (
            <li key={i}>
              {i > 0 && <hr />}
              <div className="timeline-start text-xs text-base-content/50 whitespace-nowrap">
                {new Date(e.time).toLocaleString()}
              </div>
              <div className="timeline-middle">
                {e.success ? (
                  <CheckIcon className="size-4 text-success" />
                ) : (
                  <XIcon className="size-4 text-error" />
                )}
              </div>
              <div className="timeline-end timeline-box">
                <span className="capitalize font-medium">{e.action}</span> {e.name}
                {e.isCask && <span className="badge badge-xs badge-secondary badge-outline ml-2">{t('history.caskBadge')}</span>}
              </div>
              {i < sorted.length - 1 && <hr />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
