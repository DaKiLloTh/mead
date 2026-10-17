import { useSignal } from '@preact/signals'
import { useEffect, useMemo, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { api, SearchResult } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import SearchResultCard from '../components/SearchResultCard'
import { SearchIcon } from '../components/Icons'

type Filter = 'all' | 'formula' | 'cask'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Search({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const query = useSignal('')
  const results = useSignal<SearchResult[] | null>(null)
  const loading = useSignal(false)
  const filter = useSignal<Filter>('all')
  const detail = useSignal<DetailTarget | null>(null)
  const installedKeys = useSignal<Set<string>>(new Set())
  const rowBusy = useSignal<string | null>(null)
  const searchDesc = useSignal(false)
  // issuedSeqRef: id of the most recently *fired* search request (assigned
  // when its debounce elapses, not on every keystroke). appliedSeqRef: id
  // of the most recently *applied* (rendered) response. Together these let
  // every request run to completion and update the UI as it lands -- a
  // response is only refused if something newer has already been applied,
  // not merely because a newer request has since started. That's what
  // keeps typing responsive (an early, fast response can render before a
  // slower later one arrives) while still guaranteeing a slow, broader,
  // out-of-order response (e.g. "ard" arriving after "arduino" already
  // rendered) can never clobber a fresher, more relevant one.
  const issuedSeqRef = useRef(0)
  const appliedSeqRef = useRef(0)

  useEffect(() => {
    api
      .listInstalled()
      .then((pkgs) => (installedKeys.value = new Set(pkgs.map((p) => `${p.isCask ? 'c' : 'f'}:${p.name}`))))
      .catch(() => {})
  }, [installedKeys, refreshToken])

  useEffect(() => {
    const q = query.value.trim()
    if (!q) {
      results.value = null
      loading.value = false
      return
    }
    loading.value = true
    // Debounced so fast, continuous typing doesn't fire a real search on
    // every keystroke -- but once a request does fire, it's left to run
    // and its response is allowed to render (not aborted) purely because
    // a newer request has since started. Only an out-of-order response --
    // one that resolves after something issued later has already been
    // applied -- gets dropped. That's the actual bug: a broader query
    // (e.g. "ard", which matches far more packages than "arduino" and so
    // takes longer to enrich/rank) arriving after a narrower one and
    // clobbering its more relevant results, not merely that two requests
    // overlapped.
    const handle = setTimeout(() => {
      const seq = ++issuedSeqRef.current
      api
        .search(q, searchDesc.value)
        .then((r) => {
          if (seq > appliedSeqRef.current) {
            appliedSeqRef.current = seq
            results.value = r
          }
        })
        .catch(() => {
          if (seq > appliedSeqRef.current) {
            appliedSeqRef.current = seq
            results.value = []
          }
        })
        .finally(() => {
          // Only the most recently *issued* request controls the spinner
          // -- an older one settling after a newer one has already started
          // shouldn't flip loading back off.
          if (seq === issuedSeqRef.current) loading.value = false
        })
    }, 300)
    return () => clearTimeout(handle)
  }, [loading, query.value, results, searchDesc.value])

  const filtered = useMemo(() => {
    if (!results.value) return []
    return results.value.filter((r) => {
      if (filter.value === 'formula') return !r.isCask
      if (filter.value === 'cask') return r.isCask
      return true
    })
  }, [results.value, filter.value])

  async function quickInstall(r: SearchResult) {
    const key = `${r.isCask ? 'c' : 'f'}:${r.name}`
    rowBusy.value = key
    await runAction(() => api.install(r.name, r.isCask))
    rowBusy.value = null
    installedKeys.value = new Set(installedKeys.value).add(key)
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
            value={query.value}
            autoFocus
            onChange={(e) => (query.value = e.currentTarget.value)}
          />
          {loading.value && <span className="loading loading-spinner loading-xs" />}
        </label>

        <label className="label cursor-pointer gap-2 text-sm w-fit">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={searchDesc.value}
            onChange={(e) => (searchDesc.value = e.currentTarget.checked)}
          />
          <span className="label-text">{t('search.searchDescLabel')}</span>
        </label>
      </div>

      {results.value && (
        <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
          <button
            role="tab"
            className={`tab ${filter.value === 'all' ? 'tab-active' : ''}`}
            onClick={() => (filter.value = 'all')}
          >
            {t('search.tabAll', { count: results.value.length })}
          </button>
          <button
            role="tab"
            className={`tab ${filter.value === 'formula' ? 'tab-active' : ''}`}
            onClick={() => (filter.value = 'formula')}
          >
            {t('search.tabFormulae', { count: results.value.filter((r) => !r.isCask).length })}
          </button>
          <button
            role="tab"
            className={`tab ${filter.value === 'cask' ? 'tab-active' : ''}`}
            onClick={() => (filter.value = 'cask')}
          >
            {t('search.tabCasks', { count: results.value.filter((r) => r.isCask).length })}
          </button>
        </div>
      )}

      {!results.value && !loading.value && (
        <div className="text-base-content/50 text-sm py-8 text-center">{t('search.emptyPrompt')}</div>
      )}

      {results.value && (
        // Dimmed rather than cleared while a newer query is in flight --
        // these results are about to be superseded by whatever's loading
        // now (see the effect above), so this keeps that visible instead
        // of letting a stale, possibly-irrelevant list sit there looking
        // current until the new one lands.
        <div className={`flex flex-col gap-3 transition-opacity ${loading.value ? 'opacity-50' : ''}`}>
          {filtered.map((r) => {
            const key = `${r.isCask ? 'c' : 'f'}:${r.name}`
            return (
              <SearchResultCard
                key={key}
                result={r}
                installed={installedKeys.value.has(key)}
                busy={rowBusy.value === key}
                onOpenDetail={() => (detail.value = { name: r.name, isCask: r.isCask })}
                onInstall={() => void quickInstall(r)}
              />
            )
          })}
          {filtered.length === 0 && !loading.value && (
            <div className="text-base-content/50 text-sm py-8 text-center">{t('search.noResults')}</div>
          )}
        </div>
      )}

      <PackageDetailModal
        target={detail.value}
        onClose={() => (detail.value = null)}
        onChanged={() => {
          bump()
        }}
      />
    </div>
  )
}
