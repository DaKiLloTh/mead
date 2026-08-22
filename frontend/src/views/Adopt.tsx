import { useState } from 'react'
import { api, AdoptCandidate } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { DownloadIcon, ImportIcon } from '../components/Icons'

interface Props {
  bump: () => void
}

export default function Adopt({ bump }: Props) {
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
      <h1 className="text-2xl font-bold mb-1">Adopt Existing Apps</h1>
      <p className="text-base-content/60 text-sm mb-4">
        Apps already in <span className="font-mono">/Applications</span> that match an installable cask, so future
        updates can run through Homebrew instead of each app's own updater.
      </p>

      <button className="btn btn-sm btn-primary mb-4" disabled={loading} onClick={scan}>
        {loading ? <span className="loading loading-spinner loading-xs" /> : <ImportIcon className="size-4" />}
        Scan /Applications
      </button>

      {loading && (
        <p className="text-sm text-base-content/50">
          Checking each app against Homebrew's cask index — this can take a little while.
        </p>
      )}

      {error && !loading && (
        <div className="alert alert-error alert-soft text-sm mb-4">
          <div>
            <div className="font-medium">Scan failed</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {candidates && !loading && (
        <>
          {candidates.length === 0 ? (
            <div className="alert alert-success alert-soft text-sm">
              Nothing to adopt — everything matched is already Homebrew-managed (or nothing matched a known cask).
            </div>
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
                    <th>App</th>
                    <th>Matched cask</th>
                    <th>Version</th>
                    <th className="text-right">Action</th>
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
                          Adopt
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
