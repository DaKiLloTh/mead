import { untracked, useSignal, useSignalEffect } from '@preact/signals'
import { useTranslation } from 'react-i18next'
import { api, Collection } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { bump } from '../context/RefreshSignal'
import { DownloadIcon, GridIcon } from '../components/Icons'

export default function Collections() {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const collections = useSignal<Collection[]>([])
  const installing = useSignal<string | null>(null)

  useSignalEffect(() =>
    untracked(() => {
      api.getCollections().then((v) => (collections.value = v))
    })
  )

  async function install(c: Collection) {
    installing.value = c.name
    await runAction(() => api.installCollection(c.name))
    installing.value = null
    bump()
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">{t('collections.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">{t('collections.subtitle')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.value.map((c) => (
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
                  disabled={installing.value === c.name}
                  onClick={() => install(c)}
                >
                  {installing.value === c.name ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <DownloadIcon className="size-4" />
                  )}
                  {t('collections.installAll')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
