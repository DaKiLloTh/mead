import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { api, BundleCleanupItem, BundleEntryType, CacheInfo, LeftoverItem, LeftoverKind, PackageSize } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  AppWindowIcon,
  BeakerIcon,
  CheckIcon,
  DownloadIcon,
  ImportIcon,
  RefreshIcon,
  TrashIcon,
  WrenchIcon,
} from '../components/Icons'
import TypeBadge from '../components/TypeBadge'
import BundleEntryBadge from '../components/BundleEntryBadge'
import TableShell from '../components/TableShell'
import LoadingRow from '../components/LoadingRow'

type Tab = 'doctor' | 'cleanup' | 'leftovers' | 'brewfile' | 'config'

const leftoverKindLabelKeys: Record<LeftoverKind, string> = {
  applicationSupport: 'maintenance.kindApplicationSupport',
  caches: 'maintenance.kindCaches',
  preferences: 'maintenance.kindPreferences',
  logs: 'maintenance.kindLogs',
  savedState: 'maintenance.kindSavedState',
}

export default function Maintenance() {
  const { t } = useTranslation()
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const tab = useSignal<Tab>('doctor')

  const doctorOutput = useSignal<string[] | null>(null)
  const doctorRunning = useSignal(false)

  const cache = useSignal<CacheInfo | null>(null)
  const largest = useSignal<PackageSize[] | null>(null)
  const largestLoading = useSignal(false)
  const cleanupOutput = useSignal<string[] | null>(null)
  const cleanupRunning = useSignal<'preview' | 'real' | 'autoremove' | 'autoremove-preview' | null>(null)
  const clearingCache = useSignal(false)

  const leftovers = useSignal<LeftoverItem[] | null>(null)
  const leftoversLoading = useSignal(false)
  const selectedLeftovers = useSignal<Set<string>>(new Set())
  const deletingLeftovers = useSignal(false)

  const config = useSignal<string | null>(null)
  const configLoading = useSignal(false)

  const exporting = useSignal(false)
  const exportedPath = useSignal<string | null>(null)
  const importing = useSignal(false)

  const bundlePath = useSignal<string | null>(null)
  const bundleCheckResult = useSignal<string | null>(null)
  const bundleCheckLoading = useSignal(false)
  const bundleListResult = useSignal<string | null>(null)
  const bundleListLoading = useSignal(false)
  const cleanupPreview = useSignal<BundleCleanupItem[] | null>(null)
  const cleanupPreviewLoading = useSignal(false)
  const cleanupRunningReal = useSignal(false)

  useEffect(() => {
    api
      .cacheInfo()
      .then((v) => (cache.value = v))
      .catch(() => {})
    loadLargest()
    // Only reads and writes signals, which never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadLargest() {
    largestLoading.value = true
    try {
      largest.value = await api.largestInstalledPackages()
    } catch {
      // best-effort report; leave whatever was previously loaded in place
    } finally {
      largestLoading.value = false
    }
  }

  async function runAutoremove(dryRun: boolean) {
    cleanupRunning.value = dryRun ? 'autoremove-preview' : 'autoremove'
    cleanupOutput.value = null
    const job = await runAction(() => api.autoremove(dryRun))
    cleanupOutput.value = job.lines.map((l) => l.text)
    cleanupRunning.value = null
  }

  async function doExport() {
    exporting.value = true
    exportedPath.value = null
    try {
      const path = await api.exportBrewfileToFile()
      exportedPath.value = path || null
    } finally {
      exporting.value = false
    }
  }

  async function doImport() {
    importing.value = true
    await runAction(() => api.importBrewfile())
    importing.value = false
  }

  async function pickBundlePath() {
    const path = await api.pickBrewfile()
    if (!path) return
    bundlePath.value = path
    bundleCheckResult.value = null
    bundleListResult.value = null
    cleanupPreview.value = null
  }

  async function doBundleCheck() {
    if (!bundlePath.value) return
    bundleCheckLoading.value = true
    try {
      bundleCheckResult.value = await api.bundleCheck(bundlePath.value)
    } catch (e) {
      bundleCheckResult.value = String(e)
    } finally {
      bundleCheckLoading.value = false
    }
  }

  async function doBundleList() {
    if (!bundlePath.value) return
    bundleListLoading.value = true
    try {
      bundleListResult.value = await api.bundleList(bundlePath.value)
    } catch (e) {
      bundleListResult.value = String(e)
    } finally {
      bundleListLoading.value = false
    }
  }

  async function doCleanupPreview() {
    if (!bundlePath.value) return
    cleanupPreviewLoading.value = true
    try {
      cleanupPreview.value = await api.bundleCleanupPreview(bundlePath.value)
    } finally {
      cleanupPreviewLoading.value = false
    }
  }

  async function doCleanupReal() {
    const path = bundlePath.value
    if (!path || !cleanupPreview.value || cleanupPreview.value.length === 0) return
    const { ok, checked } = await confirm({
      title: t('maintenance.confirmRemoveTitle', { count: cleanupPreview.value.length }),
      body: t('maintenance.confirmRemoveBody', { names: cleanupPreview.value.map((i) => i.name).join(', ') }),
      confirmLabel: t('maintenance.confirmRemoveLabel'),
      danger: true,
      checkboxes: [{ label: t('maintenance.checkboxSnapshot') }],
    })
    if (!ok) return
    if (checked[0]) {
      try {
        await api.createSnapshot()
        notify('success', t('maintenance.localSnapshotCreated'))
      } catch (e) {
        notify('error', String(e))
      }
    }
    cleanupRunningReal.value = true
    await runAction(() => api.bundleCleanup(path))
    cleanupRunningReal.value = false
    cleanupPreview.value = null
  }

  async function runDoctor() {
    doctorRunning.value = true
    doctorOutput.value = null
    const job = await runAction(() => api.doctor())
    doctorOutput.value = job.lines.map((l) => l.text)
    doctorRunning.value = false
  }

  async function runCleanup(dryRun: boolean) {
    cleanupRunning.value = dryRun ? 'preview' : 'real'
    cleanupOutput.value = null
    const job = await runAction(() => api.cleanup(dryRun))
    cleanupOutput.value = job.lines.map((l) => l.text)
    cleanupRunning.value = null
    api
      .cacheInfo()
      .then((v) => (cache.value = v))
      .catch(() => {})
  }

  async function runClearCache() {
    clearingCache.value = true
    cleanupOutput.value = null
    const job = await runAction(() => api.clearCache())
    cleanupOutput.value = job.lines.map((l) => l.text)
    clearingCache.value = false
    api
      .cacheInfo()
      .then((v) => (cache.value = v))
      .catch(() => {})
  }

  async function loadConfig() {
    configLoading.value = true
    try {
      const c = await api.config()
      config.value = c
    } finally {
      configLoading.value = false
    }
  }

  async function scanLeftovers() {
    leftoversLoading.value = true
    selectedLeftovers.value = new Set()
    try {
      leftovers.value = await api.scanLeftovers()
    } catch (e) {
      notify('error', String(e))
    } finally {
      leftoversLoading.value = false
    }
  }

  function toggleLeftover(path: string) {
    const next = new Set(selectedLeftovers.value)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    selectedLeftovers.value = next
  }

  function toggleAllLeftovers() {
    if (!leftovers.value) return
    selectedLeftovers.value =
      selectedLeftovers.value.size === leftovers.value.length ? new Set() : new Set(leftovers.value.map((l) => l.path))
  }

  async function deleteSelectedLeftovers() {
    if (!leftovers.value || selectedLeftovers.value.size === 0) return
    const selected = leftovers.value.filter((l) => selectedLeftovers.value.has(l.path))
    const { ok } = await confirm({
      title: t('maintenance.confirmDeleteLeftoversTitle', { count: selected.length }),
      body: t('maintenance.confirmDeleteLeftoversBody', { names: selected.map((l) => l.name).join(', ') }),
      confirmLabel: t('maintenance.confirmDeleteLeftoversLabel'),
      danger: true,
    })
    if (!ok) return

    deletingLeftovers.value = true
    try {
      await api.deleteLeftovers(selected.map((l) => l.path))
      notify('success', t('maintenance.leftoversDeleted', { count: selected.length }))
      await scanLeftovers()
    } catch (e) {
      notify('error', String(e))
    } finally {
      deletingLeftovers.value = false
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">{t('maintenance.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">{t('maintenance.subtitle')}</p>

      <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
        <button
          role="tab"
          className={`tab ${tab.value === 'doctor' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'doctor')}
        >
          <WrenchIcon className="size-3.5 mr-1" /> {t('maintenance.tabDoctor')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'cleanup' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'cleanup')}
        >
          <TrashIcon className="size-3.5 mr-1" /> {t('maintenance.tabCleanup')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'leftovers' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'leftovers')}
        >
          <AppWindowIcon className="size-3.5 mr-1" /> {t('maintenance.tabLeftovers')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'brewfile' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'brewfile')}
        >
          <ImportIcon className="size-3.5 mr-1" /> {t('maintenance.tabBrewfile')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'config' ? 'tab-active' : ''}`}
          onClick={() => {
            tab.value = 'config'
            if (config.value === null) void loadConfig()
          }}
        >
          <BeakerIcon className="size-3.5 mr-1" /> {t('maintenance.tabConfig')}
        </button>
      </div>

      {tab.value === 'doctor' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">{t('maintenance.doctorDescription')}</p>
          <button className="btn btn-sm btn-primary" disabled={doctorRunning.value} onClick={runDoctor}>
            {doctorRunning.value ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <WrenchIcon className="size-4" />
            )}
            {t('maintenance.runDoctor')}
          </button>
          {doctorOutput.value && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-96">
              <code className="whitespace-pre px-4">
                {doctorOutput.value.join('\n') || t('maintenance.doctorAllGood')}
              </code>
            </pre>
          )}
        </div>
      )}

      {tab.value === 'cleanup' && (
        <div className="space-y-3">
          {cache.value && (
            <div className="stats shadow bg-base-200">
              <div className="stat py-3">
                <div className="stat-title">{t('maintenance.downloadCache')}</div>
                <div className="stat-value text-lg">{cache.value.sizeHuman}</div>
                <div className="stat-desc font-mono truncate max-w-xs">{cache.value.path}</div>
                <div className="stat-actions">
                  <button
                    className="btn btn-xs"
                    disabled={clearingCache.value || cleanupRunning.value !== null}
                    onClick={runClearCache}
                  >
                    {clearingCache.value ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <TrashIcon className="size-3.5" />
                    )}
                    {t('maintenance.clearCacheButton')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {cache.value && <p className="text-xs text-base-content/50">{t('maintenance.clearCacheDescription')}</p>}

          <p className="text-sm text-base-content/70">{t('maintenance.cleanupDescription')}</p>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              disabled={cleanupRunning.value !== null || clearingCache.value}
              onClick={() => runCleanup(true)}
            >
              {cleanupRunning.value === 'preview' ? <span className="loading loading-spinner loading-xs" /> : null}
              {t('maintenance.previewDryRun')}
            </button>
            <button
              className="btn btn-sm btn-error"
              disabled={cleanupRunning.value !== null || clearingCache.value}
              onClick={() => runCleanup(false)}
            >
              {cleanupRunning.value === 'real' ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <TrashIcon className="size-4" />
              )}
              {t('maintenance.cleanUpNow')}
            </button>
          </div>

          <div className="divider my-1" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-base-content/70">{t('maintenance.largestDescription')}</p>
              <button className="btn btn-xs" disabled={largestLoading.value} onClick={loadLargest}>
                {largestLoading.value ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <RefreshIcon className="size-3.5" />
                )}
                {t('common.refresh')}
              </button>
            </div>
            {largest.value && largest.value.length > 0 && (
              <TableShell colgroup={[<col />, <col className="w-24" />, <col className="w-28" />]}>
                <thead>
                  <tr>
                    <th>{t('maintenance.colName')}</th>
                    <th>{t('maintenance.colType')}</th>
                    <th className="text-right">{t('maintenance.colSize')}</th>
                  </tr>
                </thead>
                <tbody>
                  {largest.value.map((p) => (
                    <tr key={`${p.isCask ? 'c' : 'f'}:${p.name}`} className="hover:bg-base-200">
                      <td className="font-medium truncate">{p.name}</td>
                      <td>
                        <TypeBadge isCask={p.isCask} />
                      </td>
                      <td className="text-right font-mono text-xs">{p.sizeHuman}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
            {largest.value && largest.value.length === 0 && (
              <div className="text-xs text-base-content/50">{t('maintenance.noInstalledPackages')}</div>
            )}
          </div>

          <div className="divider my-1" />

          <p className="text-sm text-base-content/70">{t('maintenance.autoremoveDescription')}</p>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              disabled={cleanupRunning.value !== null || clearingCache.value}
              onClick={() => runAutoremove(true)}
            >
              {cleanupRunning.value === 'autoremove-preview' ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              {t('maintenance.previewOrphans')}
            </button>
            <button
              className="btn btn-sm btn-warning"
              disabled={cleanupRunning.value !== null || clearingCache.value}
              onClick={() => runAutoremove(false)}
            >
              {cleanupRunning.value === 'autoremove' ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <TrashIcon className="size-4" />
              )}
              {t('maintenance.removeOrphanedDeps')}
            </button>
          </div>
          {cleanupOutput.value && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-96">
              <code className="whitespace-pre px-4">
                {cleanupOutput.value.join('\n') || t('maintenance.nothingToCleanUp')}
              </code>
            </pre>
          )}
        </div>
      )}

      {tab.value === 'leftovers' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">{t('maintenance.leftoversDescription')}</p>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm btn-primary" disabled={leftoversLoading.value} onClick={scanLeftovers}>
              {leftoversLoading.value ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <AppWindowIcon className="size-4" />
              )}
              {t('maintenance.scanLeftovers')}
            </button>
            {leftovers.value && leftovers.value.length > 0 && (
              <button className="btn btn-xs" onClick={toggleAllLeftovers}>
                {selectedLeftovers.value.size === leftovers.value.length
                  ? t('maintenance.selectNone')
                  : t('maintenance.selectAll')}
              </button>
            )}
          </div>

          {leftovers.value && leftovers.value.length === 0 && (
            <div className="alert alert-success alert-soft text-sm">{t('maintenance.noLeftoversFound')}</div>
          )}

          {leftovers.value && leftovers.value.length > 0 && (
            <div className="space-y-2">
              <TableShell
                colgroup={[<col className="w-8" />, <col />, <col className="w-40" />, <col className="w-24" />]}
              >
                <thead>
                  <tr>
                    <th />
                    <th>{t('maintenance.colName')}</th>
                    <th>{t('maintenance.colLocation')}</th>
                    <th className="text-right">{t('maintenance.colSize')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leftovers.value.map((item) => (
                    <tr key={item.path} className="hover:bg-base-200">
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedLeftovers.value.has(item.path)}
                          onChange={() => toggleLeftover(item.path)}
                        />
                      </td>
                      <td className="min-w-0">
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="font-mono text-xs text-base-content/50 truncate" title={item.path}>
                          {item.path}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-sm badge-outline">
                          {t(leftoverKindLabelKeys[item.kind as LeftoverKind] ?? item.kind)}
                        </span>
                      </td>
                      <td className="text-right font-mono text-xs">{item.sizeHuman}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/50">
                  {selectedLeftovers.value.size > 0
                    ? t('maintenance.selectedSummary', { count: selectedLeftovers.value.size })
                    : ''}
                </span>
                <button
                  className="btn btn-sm btn-error"
                  disabled={selectedLeftovers.value.size === 0 || deletingLeftovers.value}
                  onClick={deleteSelectedLeftovers}
                >
                  {deletingLeftovers.value ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <TrashIcon className="size-4" />
                  )}
                  {t('maintenance.removeSelectedButton', { count: selectedLeftovers.value.size })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab.value === 'brewfile' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-base-content/70 mb-2">{t('maintenance.exportDescription')}</p>
            <button className="btn btn-sm btn-primary" disabled={exporting.value} onClick={doExport}>
              {exporting.value ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              {t('maintenance.exportButton')}
            </button>
            {exportedPath.value && (
              <p className="text-xs text-success mt-2">{t('maintenance.savedTo', { path: exportedPath.value })}</p>
            )}
          </div>
          <div className="divider my-1" />
          <div>
            <p className="text-sm text-base-content/70 mb-2">{t('maintenance.importDescription')}</p>
            <button className="btn btn-sm" disabled={importing.value} onClick={doImport}>
              {importing.value ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <ImportIcon className="size-4" />
              )}
              {t('maintenance.importButton')}
            </button>
          </div>

          <div className="divider my-1" />

          <div>
            <p className="text-sm text-base-content/70 mb-2">{t('maintenance.checkDescription')}</p>
            <div className="flex items-center gap-2 mb-3">
              <button className="btn btn-sm" onClick={pickBundlePath}>
                {bundlePath.value ? t('maintenance.changeBrewfile') : t('maintenance.selectBrewfile')}
              </button>
              {bundlePath.value && (
                <span className="font-mono text-xs text-base-content/60 truncate">{bundlePath.value}</span>
              )}
            </div>

            {bundlePath.value && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-xs" disabled={bundleCheckLoading.value} onClick={doBundleCheck}>
                    {bundleCheckLoading.value && <span className="loading loading-spinner loading-xs" />}{' '}
                    {t('maintenance.check')}
                  </button>
                  <button className="btn btn-xs" disabled={bundleListLoading.value} onClick={doBundleList}>
                    {bundleListLoading.value && <span className="loading loading-spinner loading-xs" />}{' '}
                    {t('maintenance.listContents')}
                  </button>
                  <button className="btn btn-xs" disabled={cleanupPreviewLoading.value} onClick={doCleanupPreview}>
                    {cleanupPreviewLoading.value && <span className="loading loading-spinner loading-xs" />}{' '}
                    {t('maintenance.previewCleanup')}
                  </button>
                </div>

                {bundleCheckResult.value && (
                  <div
                    className={`alert alert-soft text-xs ${bundleCheckResult.value.includes('satisfied') ? 'alert-success' : 'alert-warning'}`}
                  >
                    {bundleCheckResult.value.includes('satisfied') && <CheckIcon className="size-4" />}
                    <span className="whitespace-pre-wrap">{bundleCheckResult.value}</span>
                  </div>
                )}

                {bundleListResult.value && (
                  <pre className="mockup-code text-xs overflow-x-auto max-h-64">
                    <code className="whitespace-pre px-4">{bundleListResult.value}</code>
                  </pre>
                )}

                {cleanupPreview.value && (
                  <div>
                    {cleanupPreview.value.length === 0 ? (
                      <div className="alert alert-success alert-soft text-xs">
                        {t('maintenance.cleanupNothingToRemove')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-base-content/60">{t('maintenance.notInBrewfile')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {cleanupPreview.value.map((item) => (
                            <span key={`${item.type}:${item.name}`} className="inline-flex items-center gap-1">
                              <BundleEntryBadge type={item.type as BundleEntryType} size="xs" />
                              <span className="text-xs font-mono">{item.name}</span>
                            </span>
                          ))}
                        </div>
                        <button
                          className="btn btn-xs btn-error"
                          disabled={cleanupRunningReal.value}
                          onClick={doCleanupReal}
                        >
                          {cleanupRunningReal.value ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <TrashIcon className="size-3.5" />
                          )}
                          {t('maintenance.removePackagesButton', { count: cleanupPreview.value.length })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab.value === 'config' && (
        <div className="space-y-3">
          {configLoading.value && <LoadingRow>{t('common.loading')}</LoadingRow>}
          {config.value && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-128">
              <code className="whitespace-pre px-4">{config.value}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
