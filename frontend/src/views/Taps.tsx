import { useEffect, useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, TapDetail } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { ChevronDownIcon, ExternalLinkIcon, RefreshIcon, TapIcon, TrashIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Taps({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const [taps, setTaps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTap, setNewTap] = useState('')
  const [adding, setAdding] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<TapDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [removeError, setRemoveError] = useState<Record<string, string>>({})

  function load() {
    setLoading(true)
    setError(null)
    api
      .taps()
      .then(setTaps)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  async function addTap(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newTap.trim()
    if (!name) return
    setAdding(true)
    await runAction(() => api.tapAdd(name))
    setAdding(false)
    setNewTap('')
    load()
    bump()
  }

  async function toggleExpand(name: string) {
    if (expanded === name) {
      setExpanded(null)
      return
    }
    setExpanded(name)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await api.tapInfo(name)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  async function removeTap(name: string) {
    const { ok } = await confirm({ title: t('taps.confirmRemoveTitle', { name }), danger: true, confirmLabel: t('taps.confirmRemoveLabel') })
    if (!ok) return
    setRowBusy(name)
    setRemoveError((prev) => ({ ...prev, [name]: '' }))
    const job = await runAction(() => api.tapRemove(name))
    setRowBusy(null)
    if (job.status === 'error') {
      setRemoveError((prev) => ({ ...prev, [name]: job.error || t('taps.removeFailedFallback') }))
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
    setRowBusy(name)
    await runAction(() => api.tapRemoveForce(name))
    setRowBusy(null)
    setRemoveError((prev) => ({ ...prev, [name]: '' }))
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
            value={newTap}
            onChange={(e) => setNewTap(e.target.value)}
          />
        </label>
        <button className="btn btn-sm btn-primary" type="submit" disabled={adding || !newTap.trim()}>
          {adding ? <span className="loading loading-spinner loading-xs" /> : t('taps.addButton')}
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      ) : error ? (
        <div className="alert alert-error alert-soft">
          <div>
            <div className="font-medium">{t('taps.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            <RefreshIcon className="size-4" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : (
        <ul className="menu bg-base-200 rounded-box w-full">
          {taps.map((tapName) => (
            <li key={tapName}>
              <div className="flex flex-col items-stretch p-0!">
                <div className="flex items-center justify-between px-3 py-2">
                  <button className="flex items-center gap-1.5 font-mono text-sm" onClick={() => toggleExpand(tapName)}>
                    <ChevronDownIcon className={`size-3.5 transition-transform ${expanded === tapName ? '' : '-rotate-90'}`} />
                    {tapName}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost text-error"
                    disabled={rowBusy === tapName}
                    onClick={() => removeTap(tapName)}
                    title={t('taps.untapTooltip')}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
                {expanded === tapName && (
                  <div className="px-3 pb-3 text-xs text-base-content/60">
                    {detailLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" /> {t('common.loading')}
                      </span>
                    ) : detail ? (
                      <div className="space-y-0.5">
                        {detail.remote && (
                          <div className="flex items-center gap-1">
                            <ExternalLink className="link inline-flex items-center gap-1" href={detail.remote}>
                              {detail.remote} <ExternalLinkIcon className="size-3" />
                            </ExternalLink>
                          </div>
                        )}
                        <div>
                          {t('taps.formulaCaskCounts', { formulaCount: detail.formulaCount, caskCount: detail.caskCount })}
                          {detail.official && t('taps.officialSuffix')}
                        </div>
                        {detail.lastCommit && <div>{t('taps.lastCommit', { commit: detail.lastCommit })}</div>}
                      </div>
                    ) : (
                      <span>{t('taps.noDetail')}</span>
                    )}
                  </div>
                )}
                {removeError[tapName] && (
                  <div className="px-3 pb-3">
                    <div className="alert alert-warning alert-soft text-xs flex items-center justify-between gap-2">
                      <span>{removeError[tapName]}</span>
                      <button className="btn btn-xs" onClick={() => forceRemoveTap(tapName)}>
                        {t('taps.forceUntap')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
          {taps.length === 0 && <li className="text-base-content/50 text-sm px-3 py-2">{t('taps.noTaps')}</li>}
        </ul>
      )}
    </div>
  )
}
