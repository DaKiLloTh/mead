import { useEffect, useState } from 'react'
import { api, Collection } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { DownloadIcon, GridIcon } from '../components/Icons'

interface Props {
  bump: () => void
}

export default function Collections({ bump }: Props) {
  const { runAction } = useJobs()
  const [collections, setCollections] = useState<Collection[]>([])
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    api.getCollections().then(setCollections)
  }, [])

  async function install(c: Collection) {
    setInstalling(c.name)
    await runAction(() => api.installCollection(c.name))
    setInstalling(null)
    bump()
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">Collections</h1>
      <p className="text-base-content/60 text-sm mb-4">Curated bundles for common workflows. Install everything in one go.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map((c) => (
          <div key={c.name} className="card bg-base-200">
            <div className="card-body">
              <h2 className="card-title text-base">
                <GridIcon className="size-4" /> {c.name}
              </h2>
              <p className="text-sm text-base-content/60">{c.description}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.packages.map((p) => (
                  <span key={p.name} className="badge badge-sm badge-ghost">
                    {p.name}
                  </span>
                ))}
              </div>
              <div className="card-actions mt-2">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={installing === c.name}
                  onClick={() => install(c)}
                >
                  {installing === c.name ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <DownloadIcon className="size-4" />
                  )}
                  Install all
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
