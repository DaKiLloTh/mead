import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { api, AdoptCandidate } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { DownloadIcon, ImportIcon } from '../components/Icons'

interface Props {
  bump: () => void
}

export default function Adopt({ bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const [candidates, setCandidates] = useState<AdoptCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adopting, setAdopting] = useState<string | null>(null)

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
    setAdopting(c.caskToken)
    await runAction(() => api.adoptCask(c.caskToken))
    setAdopting(null)
    setCandidates((prev) => prev?.filter((x) => x.caskToken !== c.caskToken) ?? null)
    bump()
  }

  return (
    <div className="p-6 max-w-3xl">
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
            <div className="overflow-x-auto rounded-box border border-base-300">
              <table className="table table-sm table-fixed">
                <colgroup>
                  <col />
                  <col className="w-40" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('adopt.colApp')}</th>
                    <th>{t('adopt.colMatchedCask')}</th>
                    <th>{t('adopt.colVersion')}</th>
                    <th className="text-right">{t('adopt.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.appPath} className="hover:bg-base-200">
                      <td>
                        <div className="font-medium truncate">{c.appName}</div>
                        <div className="text-xs text-base-content/50 truncate">{c.caskDesc}</div>
                      </td>
                      <td className="font-mono text-xs truncate" title={c.caskToken}>
                        {c.caskToken}
                      </td>
                      <td className="font-mono text-xs truncate" title={c.caskVersion}>
                        {c.caskVersion}
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={adopting === c.caskToken}
                          onClick={() => adopt(c)}
                        >
                          {adopting === c.caskToken ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <DownloadIcon className="size-3.5" />
                          )}
                          {t('adopt.adoptButton')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
