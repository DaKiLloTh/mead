import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { TargetedSubmitEvent } from 'preact'
import { useTranslation } from 'react-i18next'
import { api, TapDetail } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { ChevronDownIcon, ExternalLinkIcon, TapIcon, TrashIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import LoadingRow from '../components/LoadingRow'
import ErrorAlert from '../components/ErrorAlert'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Taps({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const taps = useSignal<string[]>([])
  const loading = useSignal(true)
  const error = useSignal<string | null>(null)
  const newTap = useSignal('')
  const adding = useSignal(false)
  const rowBusy = useSignal<string | null>(null)
  const expanded = useSignal<string | null>(null)
  const detail = useSignal<TapDetail | null>(null)
  const detailLoading = useSignal(false)
  const removeError = useSignal<Record<string, string>>({})

  function load() {
    loading.value = true
    error.value = null
    api
      .taps()
      .then((v) => (taps.value = v))
      .catch((e) => (error.value = String(e)))
      .finally(() => (loading.value = false))
  }

  useEffect(load, [error, loading, refreshToken, taps])

  async function addTap(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newTap.value.trim()
    if (!name) return
    adding.value = true
    await runAction(() => api.tapAdd(name))
    adding.value = false
    newTap.value = ''
    load()
    bump()
  }

  async function toggleExpand(name: string) {
    if (expanded.value === name) {
      expanded.value = null
      return
    }
    expanded.value = name
    detail.value = null
    detailLoading.value = true
    try {
      const d = await api.tapInfo(name)
      detail.value = d
    } finally {
      detailLoading.value = false
    }
  }

  async function removeTap(name: string) {
    const { ok } = await confirm({
      title: t('taps.confirmRemoveTitle', { name }),
      danger: true,
      confirmLabel: t('taps.confirmRemoveLabel'),
    })
    if (!ok) return
    rowBusy.value = name
    removeError.value = { ...removeError.value, [name]: '' }
    const job = await runAction(() => api.tapRemove(name))
    rowBusy.value = null
    if (job.status === 'error') {
      removeError.value = { ...removeError.value, [name]: job.error || t('taps.removeFailedFallback') }
      return
    }
    load()
    bump()
  }

  async function forceRemoveTap(name: string) {
    const { ok } = await confirm({
      title: t('taps.confirmForceRemoveTitle', { name }),
      body: t('taps.confirmForceRemoveBody'),
      danger: true,
      confirmLabel: t('taps.confirmForceRemoveLabel'),
    })
    if (!ok) return
    rowBusy.value = name
    await runAction(() => api.tapRemoveForce(name))
    rowBusy.value = null
    removeError.value = { ...removeError.value, [name]: '' }
    load()
    bump()
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">{t('taps.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">{t('taps.subtitle')}</p>

      <form onSubmit={addTap} className="flex gap-2 mb-6">
        <label className="input input-sm flex-1">
          <TapIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder={t('taps.addPlaceholder')}
            value={newTap.value}
            onChange={(e) => (newTap.value = e.currentTarget.value)}
          />
        </label>
        <button className="btn btn-sm btn-primary" type="submit" disabled={adding.value || !newTap.value.trim()}>
          {adding.value ? <span className="loading loading-spinner loading-xs" /> : t('taps.addButton')}
        </button>
      </form>

      {loading.value ? (
        <LoadingRow>{t('common.loading')}</LoadingRow>
      ) : error.value ? (
        <ErrorAlert title={t('taps.errorTitle')} message={error.value} onRetry={load} />
      ) : (
        <ul className="menu bg-base-200 rounded-box w-full">
          {taps.value.map((tapName) => (
            <li key={tapName}>
              <div className="flex flex-col items-stretch p-0!">
                <div className="flex items-center justify-between px-3 py-2">
                  <button className="flex items-center gap-1.5 font-mono text-sm" onClick={() => toggleExpand(tapName)}>
                    <ChevronDownIcon
                      className={`size-3.5 transition-transform ${expanded.value === tapName ? '' : '-rotate-90'}`}
                    />
                    {tapName}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost text-error"
                    disabled={rowBusy.value === tapName}
                    onClick={() => removeTap(tapName)}
                    title={t('taps.untapTooltip')}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
                {expanded.value === tapName && (
                  <div className="px-3 pb-3 text-xs text-base-content/60">
                    {detailLoading.value ? (
                      <span className="flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" /> {t('common.loading')}
                      </span>
                    ) : detail.value ? (
                      <div className="space-y-0.5">
                        {detail.value.remote && (
                          <div className="flex items-center gap-1">
                            <ExternalLink className="link inline-flex items-center gap-1" href={detail.value.remote}>
                              {detail.value.remote} <ExternalLinkIcon className="size-3" />
                            </ExternalLink>
                          </div>
                        )}
                        <div>
                          {t('taps.formulaCaskCounts', {
                            formulaCount: detail.value.formulaCount,
                            caskCount: detail.value.caskCount,
                          })}
                          {detail.value.official && t('taps.officialSuffix')}
                        </div>
                        {detail.value.lastCommit && (
                          <div>{t('taps.lastCommit', { commit: detail.value.lastCommit })}</div>
                        )}
                      </div>
                    ) : (
                      <span>{t('taps.noDetail')}</span>
                    )}
                  </div>
                )}
                {removeError.value[tapName] && (
                  <div className="px-3 pb-3">
                    <div className="alert alert-warning alert-soft text-xs flex items-center justify-between gap-2">
                      <span>{removeError.value[tapName]}</span>
                      <button className="btn btn-xs" onClick={() => forceRemoveTap(tapName)}>
                        {t('taps.forceUntap')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
          {taps.value.length === 0 && <li className="text-base-content/50 text-sm px-3 py-2">{t('taps.noTaps')}</li>}
        </ul>
      )}
    </div>
  )
}
