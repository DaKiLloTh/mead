import { useEffect, useMemo, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { api, SearchResult } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import ExternalLink from '../components/ExternalLink'
import {
  BadgeBrokenIcon,
  BadgeInstalledIcon,
  DownloadIcon,
  ExternalLinkIcon,
  SearchIcon,
  TapIcon,
} from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask'

// The two official taps every formula/cask not from a third party belongs
// to. Anything else means the result comes from a tap Homebrew itself
// doesn't vet -- worth flagging on a search result specifically, since
// that's the one place in the app someone might install something they've
// never heard of before.
const OFFICIAL_TAPS = new Set(['homebrew/core', 'homebrew/cask'])

function formulaeBrewShUrl(r: SearchResult): string {
  return `https://formulae.brew.sh/${r.isCask ? 'cask' : 'formula'}/${encodeURIComponent(r.name)}`
}

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
      setLoading(false)
      return
    }
    setLoading(true)
    // Standard AbortController-guarded debounced search (the same idiom
    // React's own docs, SWR, and React Query all use for search-as-you-
    // type): the debounce timer alone only stops a search that hasn't
    // fired yet, but once api.search() is in flight there's nothing
    // stopping an earlier, broader query (e.g. "ard", which matches far
    // more packages than "arduino" and so takes longer to enrich/rank)
    // from resolving AFTER a later, narrower one and clobbering its more
    // relevant results -- exactly the "fast relevant results replaced by
    // a slow irrelevant pile" bug this fixes. Every branch checks
    // `signal.aborted` before touching state, so only the most recent
    // effect's response is ever applied.
    //
    // Wails-bound calls (api.search -> App.Search over Wails' own RPC
    // bridge) aren't real fetch()es, so aborting here doesn't cancel the
    // in-flight backend work the way it would for an actual network
    // request -- but AbortController/AbortSignal is still the right,
    // standard vehicle for "is this response still wanted", which is the
    // actual bug being fixed: which response gets applied client-side.
    const controller = new AbortController()
    const handle = setTimeout(() => {
      api
        .search(q, searchDesc)
        .then((r) => {
          if (!controller.signal.aborted) setResults(r)
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
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
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {loading && <span className="loading loading-spinner loading-xs" />}
        </label>

        <label className="label cursor-pointer gap-2 text-sm w-fit">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={searchDesc}
            onChange={(e) => setSearchDesc(e.currentTarget.checked)}
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
          <button
            role="tab"
            className={`tab ${filter === 'cask' ? 'tab-active' : ''}`}
            onClick={() => setFilter('cask')}
          >
            {t('search.tabCasks', { count: results.filter((r) => r.isCask).length })}
          </button>
        </div>
      )}

      {!results && !loading && (
        <div className="text-base-content/50 text-sm py-8 text-center">{t('search.emptyPrompt')}</div>
      )}

      {results && (
        // Dimmed rather than cleared while a newer query is in flight --
        // these results are about to be superseded by whatever's loading
        // now (see the effect above), so this keeps that visible instead
        // of letting a stale, possibly-irrelevant list sit there looking
        // current until the new one lands.
        <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
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
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {r.homepage && (
                      <ExternalLink
                        href={r.homepage}
                        className="btn btn-ghost btn-xs btn-square"
                        title={t('search.homepageLink')}
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </ExternalLink>
                    )}
                    <ExternalLink
                      href={formulaeBrewShUrl(r)}
                      className="btn btn-ghost btn-xs btn-square"
                      title={t('search.formulaeBrewShLink')}
                    >
                      <TapIcon className="size-3.5" />
                    </ExternalLink>
                    <span className={`badge badge-sm badge-outline ${r.isCask ? 'badge-secondary' : 'badge-primary'}`}>
                      {r.isCask ? t('common.cask') : t('common.formula')}
                    </span>
                  </div>
                </div>

                <div className="border-t border-base-300/50 pt-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.version && <span className="font-mono text-xs text-base-content/60">{r.version}</span>}
                    {r.tap && !OFFICIAL_TAPS.has(r.tap.toLowerCase()) && (
                      <span
                        className="badge badge-sm badge-warning badge-outline gap-1"
                        title={t('search.nonStandardTapTooltip')}
                      >
                        <TapIcon className="size-3" />
                        {r.tap}
                      </span>
                    )}
                    {r.deprecated && (
                      <span className="badge badge-sm badge-error badge-outline gap-1">
                        <BadgeBrokenIcon className="size-3" />
                        {t('common.badgeDeprecated')}
                      </span>
                    )}
                    {r.disabled && (
                      <span className="badge badge-sm badge-error gap-1">{t('common.badgeDisabled')}</span>
                    )}
                    {r.isCask && r.autoUpdates && (
                      <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>
                    )}
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
