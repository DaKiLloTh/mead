import { useComputed, useSignal } from '@preact/signals'
import { useTranslation } from 'react-i18next'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { installedPackagesSignal, useInstalledPackages } from '../context/InstalledPackagesSignal'
import { bump } from '../context/RefreshSignal'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import PackageIcon from '../components/PackageIcon'
import { SearchIcon } from '../components/Icons'
import LoadingRow from '../components/LoadingRow'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'

export default function Applications() {
  const { t } = useTranslation()
  const { notify } = useJobs()
  const { packages: cachedPkgs, loading, error, refresh } = useInstalledPackages()
  const query = useSignal('')
  const detail = useSignal<DetailTarget | null>(null)

  // Every installed cask that declares at least one app artifact -- the
  // same signal security.ResolveCaskAppPath ultimately relies on (see
  // internal/brew's parseCaskArtifacts). A cask with a declared app path
  // whose file has since gone missing on disk still shows up as a tile
  // here; the icon falls back to the monogram and double-click surfaces an
  // error toast rather than being silently excluded from the grid.
  const apps = useComputed(() => {
    const q = query.value.trim().toLowerCase()
    return (installedPackagesSignal.value.packages ?? [])
      .filter((p) => p.isCask && p.installed && (p.appPaths?.length ?? 0) > 0)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.fullName?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

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
            {error ? t('applications.subtitleError') : t('applications.subtitleCount', { count: apps.value.length })}
          </p>
        </div>
        <label className="input input-sm w-64">
          <SearchIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder={t('applications.filterPlaceholder')}
            value={query.value}
            onChange={(e) => (query.value = e.currentTarget.value)}
          />
        </label>
      </div>

      {error ? (
        <ErrorAlert title={t('applications.errorTitle')} message={error} onRetry={refresh} />
      ) : loading && (cachedPkgs?.length ?? 0) === 0 ? (
        <LoadingRow>{t('common.loading')}</LoadingRow>
      ) : apps.value.length === 0 ? (
        <EmptyState>{t('applications.noMatches')}</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
          {apps.value.map((p) => (
            <button
              key={p.name}
              className="flex flex-col items-center gap-1.5 rounded-box p-3 border border-transparent hover:bg-base-200 hover:border-base-300 text-center transition-colors"
              onClick={() => (detail.value = { name: p.name, isCask: true })}
              onDblClick={() => openApp(p)}
              title={p.desc || p.name}
            >
              <PackageIcon name={p.name} isCask className="size-12" />
              <span className="text-xs font-medium truncate w-full">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <PackageDetailModal
        target={detail.value}
        onClose={() => (detail.value = null)}
        onChanged={() => {
          refresh()
          bump()
        }}
      />
    </div>
  )
}
