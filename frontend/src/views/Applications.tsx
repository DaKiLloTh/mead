import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useInstalledPackages } from '../context/InstalledPackagesSignal'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import PackageIcon from '../components/PackageIcon'
import { RefreshIcon, SearchIcon } from '../components/Icons'

interface Props {
  bump: () => void
}

export default function Applications({ bump }: Props) {
  const { t } = useTranslation()
  const { notify } = useJobs()
  const { packages: cachedPkgs, loading, error, refresh } = useInstalledPackages()
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<DetailTarget | null>(null)

  // Every installed cask that declares at least one app artifact -- the
  // same signal security.ResolveCaskAppPath ultimately relies on (see
  // internal/brew's parseCaskArtifacts). A cask with a declared app path
  // whose file has since gone missing on disk still shows up as a tile
  // here; the icon falls back to the monogram and double-click surfaces an
  // error toast rather than being silently excluded from the grid.
  const apps = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (cachedPkgs ?? [])
      .filter((p) => p.isCask && p.installed && (p.appPaths?.length ?? 0) > 0)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.fullName?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cachedPkgs, query])

  async function openApp(p: BrewPackage) {
    try {
      await api.openCaskApp(p.name)
    } catch (e) {
      notify('error', String(e))
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('applications.title')}</h1>
          <p className="text-base-content/60 text-sm">
            {error ? t('applications.subtitleError') : t('applications.subtitleCount', { count: apps.length })}
          </p>
        </div>
        <label className="input input-sm w-64">
          <SearchIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder={t('applications.filterPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="alert alert-error alert-soft">
          <div>
            <div className="font-medium">{t('applications.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button className="btn btn-sm" onClick={refresh}>
            <RefreshIcon className="size-4" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : loading && (cachedPkgs?.length ?? 0) === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('common.loading')}
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center text-base-content/50 py-12">{t('applications.noMatches')}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
          {apps.map((p) => (
            <button
              key={p.name}
              className="flex flex-col items-center gap-1.5 rounded-box p-3 border border-transparent hover:bg-base-200 hover:border-base-300 text-center transition-colors"
              onClick={() => setDetail({ name: p.name, isCask: true })}
              onDoubleClick={() => openApp(p)}
              title={p.desc || p.name}
            >
              <PackageIcon name={p.name} isCask className="size-12" />
              <span className="text-xs font-medium truncate w-full">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <PackageDetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          refresh()
          bump()
        }}
      />
    </div>
  )
}
