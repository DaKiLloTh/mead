import { useEffect, useState } from 'react'
import { api, CacheInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { BeakerIcon, DownloadIcon, ImportIcon, TrashIcon, WrenchIcon } from '../components/Icons'

type Tab = 'doctor' | 'cleanup' | 'brewfile' | 'config'

export default function Maintenance() {
  const { runAction } = useJobs()
  const [tab, setTab] = useState<Tab>('doctor')

  const [doctorOutput, setDoctorOutput] = useState<string[] | null>(null)
  const [doctorRunning, setDoctorRunning] = useState(false)

  const [cache, setCache] = useState<CacheInfo | null>(null)
  const [cleanupOutput, setCleanupOutput] = useState<string[] | null>(null)
  const [cleanupRunning, setCleanupRunning] = useState<'preview' | 'real' | 'autoremove' | 'autoremove-preview' | null>(null)

  const [config, setConfig] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    api.cacheInfo().then(setCache).catch(() => {})
  }, [])

  async function runAutoremove(dryRun: boolean) {
    setCleanupRunning(dryRun ? 'autoremove-preview' : 'autoremove')
    setCleanupOutput(null)
    const job = await runAction(() => api.autoremove(dryRun))
    setCleanupOutput(job.lines.map((l) => l.text))
    setCleanupRunning(null)
  }

  async function doExport() {
    setExporting(true)
    setExportedPath(null)
    try {
      const path = await api.exportBrewfileToFile()
      setExportedPath(path || null)
    } finally {
      setExporting(false)
    }
  }

  async function doImport() {
    setImporting(true)
    await runAction(() => api.importBrewfile())
    setImporting(false)
  }

  async function runDoctor() {
    setDoctorRunning(true)
    setDoctorOutput(null)
    const job = await runAction(() => api.doctor())
    setDoctorOutput(job.lines.map((l) => l.text))
    setDoctorRunning(false)
  }

  async function runCleanup(dryRun: boolean) {
    setCleanupRunning(dryRun ? 'preview' : 'real')
    setCleanupOutput(null)
    const job = await runAction(() => api.cleanup(dryRun))
    setCleanupOutput(job.lines.map((l) => l.text))
    setCleanupRunning(null)
    api.cacheInfo().then(setCache).catch(() => {})
  }

  async function loadConfig() {
    setConfigLoading(true)
    try {
      const c = await api.config()
      setConfig(c)
    } finally {
      setConfigLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Maintenance</h1>
      <p className="text-base-content/60 text-sm mb-4">Diagnose problems and reclaim disk space.</p>

      <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
        <button role="tab" className={`tab ${tab === 'doctor' ? 'tab-active' : ''}`} onClick={() => setTab('doctor')}>
          <WrenchIcon className="size-3.5 mr-1" /> Doctor
        </button>
        <button role="tab" className={`tab ${tab === 'cleanup' ? 'tab-active' : ''}`} onClick={() => setTab('cleanup')}>
          <TrashIcon className="size-3.5 mr-1" /> Cleanup
        </button>
        <button role="tab" className={`tab ${tab === 'brewfile' ? 'tab-active' : ''}`} onClick={() => setTab('brewfile')}>
          <ImportIcon className="size-3.5 mr-1" /> Brewfile
        </button>
        <button
          role="tab"
          className={`tab ${tab === 'config' ? 'tab-active' : ''}`}
          onClick={() => {
            setTab('config')
            if (config === null) void loadConfig()
          }}
        >
          <BeakerIcon className="size-3.5 mr-1" /> Config
        </button>
      </div>

      {tab === 'doctor' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Checks your system for potential problems that could interfere with Homebrew.
          </p>
          <button className="btn btn-sm btn-primary" disabled={doctorRunning} onClick={runDoctor}>
            {doctorRunning ? <span className="loading loading-spinner loading-xs" /> : <WrenchIcon className="size-4" />}
            Run brew doctor
          </button>
          {doctorOutput && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-96">
              <code className="whitespace-pre px-4">{doctorOutput.join('\n') || 'Your system is ready to brew.'}</code>
            </pre>
          )}
        </div>
      )}

      {tab === 'cleanup' && (
        <div className="space-y-3">
          {cache && (
            <div className="stats shadow bg-base-200">
              <div className="stat py-3">
                <div className="stat-title">Download cache</div>
                <div className="stat-value text-lg">{cache.sizeHuman}</div>
                <div className="stat-desc font-mono truncate max-w-xs">{cache.path}</div>
              </div>
            </div>
          )}
          <p className="text-sm text-base-content/70">
            Removes old versions of installed formulae and casks, and clears the download cache.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-sm" disabled={cleanupRunning !== null} onClick={() => runCleanup(true)}>
              {cleanupRunning === 'preview' ? <span className="loading loading-spinner loading-xs" /> : null}
              Preview (dry run)
            </button>
            <button className="btn btn-sm btn-error" disabled={cleanupRunning !== null} onClick={() => runCleanup(false)}>
              {cleanupRunning === 'real' ? <span className="loading loading-spinner loading-xs" /> : <TrashIcon className="size-4" />}
              Clean up now
            </button>
          </div>
          <div className="divider my-1" />
          <p className="text-sm text-base-content/70">
            Removes formulae that were installed only as a dependency and are no longer needed by anything.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-sm" disabled={cleanupRunning !== null} onClick={() => runAutoremove(true)}>
              {cleanupRunning === 'autoremove-preview' ? <span className="loading loading-spinner loading-xs" /> : null}
              Preview orphans
            </button>
            <button className="btn btn-sm btn-warning" disabled={cleanupRunning !== null} onClick={() => runAutoremove(false)}>
              {cleanupRunning === 'autoremove' ? <span className="loading loading-spinner loading-xs" /> : <TrashIcon className="size-4" />}
              Remove orphaned dependencies
            </button>
          </div>
          {cleanupOutput && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-96">
              <code className="whitespace-pre px-4">{cleanupOutput.join('\n') || 'Nothing to clean up.'}</code>
            </pre>
          )}
        </div>
      )}

      {tab === 'brewfile' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-base-content/70 mb-2">
              Export everything you have installed to a Brewfile — a portable snapshot you can check into a dotfiles
              repo or use to set up a new machine.
            </p>
            <button className="btn btn-sm btn-primary" disabled={exporting} onClick={doExport}>
              {exporting ? <span className="loading loading-spinner loading-xs" /> : <DownloadIcon className="size-4" />}
              Export Brewfile…
            </button>
            {exportedPath && <p className="text-xs text-success mt-2">Saved to {exportedPath}</p>}
          </div>
          <div className="divider my-1" />
          <div>
            <p className="text-sm text-base-content/70 mb-2">
              Install everything listed in an existing Brewfile — useful for restoring a snapshot on a new machine.
            </p>
            <button className="btn btn-sm" disabled={importing} onClick={doImport}>
              {importing ? <span className="loading loading-spinner loading-xs" /> : <ImportIcon className="size-4" />}
              Import Brewfile…
            </button>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="space-y-3">
          {configLoading && (
            <div className="flex items-center gap-2 text-base-content/60">
              <span className="loading loading-spinner loading-sm" /> Loading…
            </div>
          )}
          {config && (
            <pre className="mockup-code text-xs overflow-x-auto max-h-[32rem]">
              <code className="whitespace-pre px-4">{config}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
