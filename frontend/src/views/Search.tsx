import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, SearchResult } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import { DownloadIcon, SearchIcon } from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Search({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [installedKeys, setInstalledKeys] = useState<Set<string>>(new Set())
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [searchDesc, setSearchDesc] = useState(false)

  useEffect(() => {
    api
      .listInstalled()
      .then((pkgs) => setInstalledKeys(new Set(pkgs.map((p) => `${p.isCask ? 'c' : 'f'}:${p.name}`))))
      .catch(() => {})
  }, [refreshToken])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      api
        .search(q, searchDesc)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query, searchDesc])

  const filtered = useMemo(() => {
    if (!results) return []
    return results.filter((r) => {
      if (filter === 'formula') return !r.isCask
      if (filter === 'cask') return r.isCask
      return true
    })
  }, [results, filter])

  async function quickInstall(r: SearchResult) {
    const key = `${r.isCask ? 'c' : 'f'}:${r.name}`
    setRowBusy(key)
    await runAction(() => api.install(r.name, r.isCask))
    setRowBusy(null)
    setInstalledKeys((prev) => new Set(prev).add(key))
    bump()
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">{t('search.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">{t('search.subtitle')}</p>

      <label className="input w-full max-w-lg mb-4">
        <SearchIcon className="size-4 opacity-50" />
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <span className="loading loading-spinner loading-xs" />}
      </label>

      <label className="label cursor-pointer gap-2 text-sm w-fit mb-4">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={searchDesc}
          onChange={(e) => setSearchDesc(e.target.checked)}
        />
        <span className="label-text">{t('search.searchDescLabel')}</span>
      </label>

      {results && (
        <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
          <button role="tab" className={`tab ${filter === 'all' ? 'tab-active' : ''}`} onClick={() => setFilter('all')}>
            {t('search.tabAll', { count: results.length })}
          </button>
          <button
            role="tab"
            className={`tab ${filter === 'formula' ? 'tab-active' : ''}`}
            onClick={() => setFilter('formula')}
          >
            {t('search.tabFormulae', { count: results.filter((r) => !r.isCask).length })}
          </button>
          <button role="tab" className={`tab ${filter === 'cask' ? 'tab-active' : ''}`} onClick={() => setFilter('cask')}>
            {t('search.tabCasks', { count: results.filter((r) => r.isCask).length })}
          </button>
        </div>
      )}

      {!results && !loading && (
        <div className="text-base-content/50 text-sm py-8 text-center">{t('search.emptyPrompt')}</div>
      )}

      {results && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((r) => {
            const key = `${r.isCask ? 'c' : 'f'}:${r.name}`
            const isInstalled = installedKeys.has(key)
            return (
              <div
                key={key}
                className="card bg-base-200 hover:bg-base-300/60 transition-colors cursor-pointer"
                onClick={() => setDetail({ name: r.name, isCask: r.isCask })}
              >
                <div className="card-body py-3 px-4 flex-row items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <span className={`badge badge-xs badge-outline ${r.isCask ? 'badge-accent' : 'badge-primary'}`}>
                      {r.isCask ? t('common.cask') : t('common.formula')}
                    </span>
                  </div>
                  {isInstalled ? (
                    <span className="badge badge-success badge-outline shrink-0">{t('common.badgeInstalled')}</span>
                  ) : (
                    <button
                      className="btn btn-xs btn-primary shrink-0"
                      disabled={rowBusy === key}
                      onClick={(e) => {
                        e.stopPropagation()
                        void quickInstall(r)
                      }}
                    >
                      {rowBusy === key ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <DownloadIcon className="size-3.5" />
                      )}
                      {t('common.install')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && !loading && (
            <div className="text-base-content/50 text-sm py-8 text-center col-span-full">{t('search.noResults')}</div>
          )}
        </div>
      )}

      <PackageDetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          bump()
        }}
      />
    </div>
  )
}
