import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { api, AdoptCandidate } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { DownloadIcon, ImportIcon, AlertIcon, CheckIcon } from '../components/Icons'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'

interface Props {
  bump: () => void
}

export default function Adopt({ bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const [candidates, setCandidates] = useState<AdoptCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adopting, setAdopting] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailTarget | null>(null)

  async function scan() {
    setLoading(true)
    setError(null)
    try {
      const results = await api.scanAdoptableApps()
      setCandidates(results)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function adopt(c: AdoptCandidate) {
    if (c.matchConfidence === 'possible') {
      const { ok } = await confirm({
        title: t('adopt.possibleMatchWarningTitle'),
        body: t('adopt.possibleMatchWarningBody', {
          appName: c.appName,
          caskToken: c.caskToken,
          reason: c.matchReason || '',
        }),
        danger: true,
        confirmLabel: t('adopt.possibleMatchConfirmLabel'),
      })
      if (!ok) return
    }
    if (c.possibleDowngrade) {
      const { ok } = await confirm({
        title: t('adopt.downgradeWarningTitle'),
        body: t('adopt.downgradeWarningBody', {
          appName: c.appName,
          installed: c.installedVersion,
          caskToken: c.caskToken,
          cask: c.caskVersion,
        }),
        danger: true,
        confirmLabel: t('adopt.downgradeConfirmLabel'),
      })
      if (!ok) return
    }
    setAdopting(c.caskToken)
    await runAction(() => api.adoptCask(c.caskToken))
    setAdopting(null)
    setCandidates((prev) => prev?.filter((x) => x.caskToken !== c.caskToken) ?? null)
    bump()
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">{t('adopt.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">
        <Trans i18nKey="adopt.subtitle" components={{ path: <span className="font-mono" /> }} />
      </p>

      <button className="btn btn-sm btn-primary mb-4" disabled={loading} onClick={scan}>
        {loading ? <span className="loading loading-spinner loading-xs" /> : <ImportIcon className="size-4" />}
        {t('adopt.scanButton')}
      </button>

      {loading && <p className="text-sm text-base-content/50">{t('adopt.scanningHint')}</p>}

      {error && !loading && (
        <div className="alert alert-error alert-soft text-sm mb-4">
          <div>
            <div className="font-medium">{t('adopt.scanFailedTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {candidates && !loading && (
        <>
          {candidates.length === 0 ? (
            <div className="alert alert-success alert-soft text-sm">{t('adopt.nothingToAdopt')}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {candidates.map((c) => {
                const versionsDiffer =
                  !!c.installedVersion && !!c.caskVersion && c.installedVersion !== c.caskVersion
                const adoptLabel = c.possibleDowngrade
                  ? t('adopt.adoptAndDowngradeButton')
                  : versionsDiffer
                    ? t('adopt.adoptAndUpdateButton')
                    : t('adopt.adoptButton')

                return (
                  <div key={c.appPath} className="rounded-box border border-base-300 p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium wrap-break-word">{c.appName}</div>
                        <div className="text-xs text-base-content/50 wrap-break-word">{c.caskDesc}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.matchConfidence === 'possible' ? (
                          <AlertIcon className="size-4 text-warning" />
                        ) : (
                          <CheckIcon className="size-4 text-success" />
                        )}
                        {c.matchConfidence === 'possible' ? (
                          <span className="badge badge-warning badge-soft badge-sm" title={c.matchReason || undefined}>
                            {t('adopt.matchPossible')}
                          </span>
                        ) : (
                          <span className="badge badge-success badge-soft badge-sm">{t('adopt.matchExact')}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs wrap-break-word">
                      <span className="text-base-content/50">{t('adopt.caskLabel')} </span>
                      <button
                        className="font-mono link link-hover text-primary"
                        onClick={() => setDetail({ name: c.caskToken, isCask: true })}
                      >
                        {c.caskToken}
                      </button>
                    </div>

                    {c.isAppStoreApp && (
                      <div className="alert alert-warning alert-soft text-xs py-2 px-3 items-start">
                        <AlertIcon className="size-3.5 shrink-0 mt-0.5" />
                        <span>{t('adopt.appStoreWarning')}</span>
                      </div>
                    )}

                    <div className="border-t border-base-300/50 pt-2 flex items-center justify-between gap-3 flex-wrap">
                      <div
                        className={`text-xs font-mono wrap-break-word flex items-center gap-1.5 ${c.possibleDowngrade ? 'text-warning' : ''}`}
                      >
                        {c.possibleDowngrade && <AlertIcon className="size-3 shrink-0" />}
                        <span>{c.installedVersion || t('adopt.versionUnknown')}</span>
                        <span className="text-base-content/40 shrink-0">→</span>
                        <span>{c.caskVersion || t('adopt.versionUnknown')}</span>
                      </div>

                      <button
                        className="btn btn-xs btn-primary shrink-0"
                        disabled={adopting === c.caskToken}
                        onClick={() => adopt(c)}
                      >
                        {adopting === c.caskToken ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <DownloadIcon className="size-3.5" />
                        )}
                        {adoptLabel}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <PackageDetailModal target={detail} onClose={() => setDetail(null)} onChanged={bump} />
    </div>
  )
}
