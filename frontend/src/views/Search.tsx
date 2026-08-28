import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, SearchResult } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import { AlertIcon, BadgeBrokenIcon, BadgeInstalledIcon, CheckIcon, DownloadIcon, SearchIcon } from '../components/Icons'

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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <label className="input w-full max-w-lg">
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

        <label className="label cursor-pointer gap-2 text-sm w-fit">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={searchDesc}
            onChange={(e) => setSearchDesc(e.target.checked)}
          />
          <span className="label-text">{t('search.searchDescLabel')}</span>
        </label>
      </div>

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
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const key = `${r.isCask ? 'c' : 'f'}:${r.name}`
            const isInstalled = installedKeys.has(key)
            return (
              <div
                key={key}
                className="rounded-box border border-base-300 p-4 flex flex-col gap-2 hover:bg-base-200/60 transition-colors cursor-pointer"
                onClick={() => setDetail({ name: r.name, isCask: r.isCask })}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium wrap-break-word">{r.name}</div>
                    {r.desc && <div className="text-xs text-base-content/50 wrap-break-word">{r.desc}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.matchConfidence === 'possible' ? (
                      <AlertIcon className="size-4 text-warning" />
                    ) : (
                      <CheckIcon className="size-4 text-success" />
                    )}
                    {r.matchConfidence === 'possible' ? (
                      <span className="badge badge-warning badge-soft badge-sm">{t('search.possibleMatch')}</span>
                    ) : (
                      <span className={`badge badge-sm badge-outline ${r.isCask ? 'badge-accent' : 'badge-primary'}`}>
                        {r.isCask ? t('common.cask') : t('common.formula')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-base-300/50 pt-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.version && <span className="font-mono text-xs text-base-content/60">{r.version}</span>}
                    {r.deprecated && (
                      <span className="badge badge-sm badge-error badge-outline gap-1">
                        <BadgeBrokenIcon className="size-3" />
                        {t('common.badgeDeprecated')}
                      </span>
                    )}
                    {r.disabled && <span className="badge badge-sm badge-error gap-1">{t('common.badgeDisabled')}</span>}
                    {r.isCask && r.autoUpdates && <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>}
                  </div>

                  {isInstalled ? (
                    <span className="badge badge-success badge-outline shrink-0 gap-1">
                      <BadgeInstalledIcon className="size-3" />
                      {t('common.badgeInstalled')}
                    </span>
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
            <div className="text-base-content/50 text-sm py-8 text-center">{t('search.noResults')}</div>
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
