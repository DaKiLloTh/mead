import { useEffect, useState } from 'react'
import { api, BrewPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  ArrowUpCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PinIcon,
  TrashIcon,
  XIcon,
} from './Icons'

export interface DetailTarget {
  name: string
  isCask: boolean
}

interface Props {
  target: DetailTarget | null
  onClose: () => void
  onChanged?: () => void
}

export default function PackageDetailModal({ target, onClose, onChanged }: Props) {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const [pkg, setPkg] = useState<BrewPackage | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'deps'>('overview')
  const [uses, setUses] = useState<string[] | null>(null)
  const [tree, setTree] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!target) return
    setLoading(true)
    setTab('overview')
    setUses(null)
    setTree(null)
    setPkg(null)
    api
      .getInfo(target.name, target.isCask)
      .then(setPkg)
      .catch(() => setPkg(null))
      .finally(() => setLoading(false))
    if (!target.isCask) {
      api
        .uses(target.name)
        .then(setUses)
        .catch(() => setUses([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.name, target?.isCask])

  if (!target) return null

  function refresh() {
    if (!target) return
    api.getInfo(target.name, target.isCask).then(setPkg).catch(() => {})
    onChanged?.()
  }

  async function loadTree() {
    if (!target || tree !== null) return
    setTreeLoading(true)
    try {
      const out = await api.deps(target.name, target.isCask)
      setTree(out)
    } catch (e) {
      setTree(String(e))
    } finally {
      setTreeLoading(false)
    }
  }

  async function doInstall() {
    if (!target) return
    setBusy(true)
    await runAction(() => api.install(target.name, target.isCask))
    setBusy(false)
    refresh()
  }

  async function doUpgrade() {
    if (!target) return
    setBusy(true)
    await runAction(() => api.upgrade(target.name, target.isCask))
    setBusy(false)
    refresh()
  }

  async function doUninstall() {
    if (!target) return
    const ok = await confirm({
      title: `Uninstall ${target.name}?`,
      body: 'This removes the package (and its keg/app) from your system.',
      confirmLabel: 'Uninstall',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    await runAction(() => api.uninstall(target.name, target.isCask))
    setBusy(false)
    refresh()
  }

  async function doPinToggle() {
    if (!target || !pkg) return
    setBusy(true)
    await runAction(() => (pkg.pinned ? api.unpin(target.name) : api.pin(target.name)))
    setBusy(false)
    refresh()
  }

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </button>

        {loading && (
          <div className="flex items-center gap-2 text-base-content/60 py-8 justify-center">
            <span className="loading loading-spinner loading-sm" /> Loading…
          </div>
        )}

        {!loading && !pkg && <div className="py-8 text-center text-base-content/60">Could not load package info.</div>}

        {!loading && pkg && (
          <>
            <div className="flex items-start gap-3 pr-8">
              <div>
                <h3 className="font-bold text-xl">{pkg.fullName || pkg.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className={`badge badge-sm ${pkg.isCask ? 'badge-accent' : 'badge-primary'} badge-outline`}>
                    {pkg.isCask ? 'cask' : 'formula'}
                  </span>
                  {pkg.installed && <span className="badge badge-sm badge-success badge-outline">installed</span>}
                  {pkg.outdated && <span className="badge badge-sm badge-warning badge-outline">outdated</span>}
                  {pkg.pinned && <span className="badge badge-sm badge-outline">pinned</span>}
                  {pkg.deprecated && <span className="badge badge-sm badge-error badge-outline">deprecated</span>}
                  {pkg.kegOnly && <span className="badge badge-sm badge-ghost">keg-only</span>}
                </div>
              </div>
            </div>

            {pkg.desc && <p className="text-sm text-base-content/80 mt-3">{pkg.desc}</p>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60 mt-2">
              {pkg.version && (
                <span>
                  Latest: <span className="font-mono">{pkg.version}</span>
                </span>
              )}
              {pkg.installedVersion && (
                <span>
                  Installed: <span className="font-mono">{pkg.installedVersion}</span>
                </span>
              )}
              {pkg.license && <span>License: {pkg.license}</span>}
              {pkg.tap && <span>Tap: {pkg.tap}</span>}
              {pkg.homepage && (
                <a
                  className="link link-hover inline-flex items-center gap-1"
                  href={pkg.homepage}
                  target="_blank"
                  rel="noreferrer"
                >
                  Homepage <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>

            <div role="tablist" className="tabs tabs-border mt-4">
              <button
                role="tab"
                className={`tab ${tab === 'overview' ? 'tab-active' : ''}`}
                onClick={() => setTab('overview')}
              >
                Overview
              </button>
              <button
                role="tab"
                className={`tab ${tab === 'deps' ? 'tab-active' : ''}`}
                onClick={() => {
                  setTab('deps')
                  void loadTree()
                }}
              >
                Dependencies
              </button>
            </div>

            {tab === 'overview' && (
              <div className="mt-3 space-y-3 text-sm">
                {pkg.caveats && (
                  <div className="alert alert-warning alert-soft text-xs whitespace-pre-wrap">{pkg.caveats}</div>
                )}
                {!pkg.isCask && (
                  <div>
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">Used by</div>
                    {uses === null ? (
                      <span className="text-base-content/50 text-xs">Loading…</span>
                    ) : uses.length === 0 ? (
                      <span className="text-base-content/50 text-xs">Nothing installed depends on this.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {uses.map((u) => (
                          <span key={u} className="badge badge-ghost badge-sm">
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {pkg.dependencies.length > 0 && (
                  <div>
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">Depends on</div>
                    <div className="flex flex-wrap gap-1">
                      {pkg.dependencies.map((d) => (
                        <span key={d} className="badge badge-ghost badge-sm">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'deps' && (
              <div className="mt-3">
                {treeLoading ? (
                  <div className="flex items-center gap-2 text-base-content/60 text-sm py-4">
                    <span className="loading loading-spinner loading-xs" /> Loading dependency tree…
                  </div>
                ) : (
                  <pre className="mockup-code text-xs overflow-x-auto max-h-72">
                    <code className="whitespace-pre px-4">{tree || 'No dependencies.'}</code>
                  </pre>
                )}
              </div>
            )}

            <div className="modal-action">
              {!pkg.isCask && pkg.installed && (
                <button className="btn btn-sm" disabled={busy} onClick={doPinToggle}>
                  <PinIcon className="size-4" /> {pkg.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {pkg.installed && pkg.outdated && (
                <button className="btn btn-sm btn-warning" disabled={busy} onClick={doUpgrade}>
                  <ArrowUpCircleIcon className="size-4" /> Upgrade
                </button>
              )}
              {pkg.installed ? (
                <button className="btn btn-sm btn-error" disabled={busy} onClick={doUninstall}>
                  <TrashIcon className="size-4" /> Uninstall
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={doInstall}>
                  <DownloadIcon className="size-4" /> Install
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  )
}
