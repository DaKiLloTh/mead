import { useEffect, useState } from 'react'
import { api, BrewPackage, SecurityInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'
import {
  ArrowUpCircleIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PinIcon,
  RefreshIcon,
  ShieldIcon,
  StarIcon,
  TagIcon,
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

type Tab = 'overview' | 'deps' | 'security'

export default function PackageDetailModal({ target, onClose, onChanged }: Props) {
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()
  const [pkg, setPkg] = useState<BrewPackage | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [uses, setUses] = useState<string[] | null>(null)
  const [tree, setTree] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [note, setNote] = useState('')
  const [security, setSecurity] = useState<SecurityInfo | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityError, setSecurityError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    setLoading(true)
    setTab('overview')
    setUses(null)
    setTree(null)
    setPkg(null)
    setSecurity(null)
    setSecurityError(null)
    setNote(userData.noteFor(target.name, target.isCask))
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

  async function loadSecurity() {
    if (!target || security || securityLoading) return
    setSecurityLoading(true)
    setSecurityError(null)
    try {
      const info = await api.inspectCaskSecurity(target.name)
      setSecurity(info)
    } catch (e) {
      setSecurityError(String(e))
    } finally {
      setSecurityLoading(false)
    }
  }

  async function doRemoveQuarantine() {
    if (!security || !target) return
    try {
      await api.removeQuarantine(target.name)
      setSecurity(null)
      void loadSecurity()
    } catch (e) {
      setSecurityError(String(e))
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
    if (!target || !pkg) return
    const checkboxes: { label: string }[] = []
    const zapIdx = target.isCask ? checkboxes.push({ label: 'Also remove app data (preferences, caches, support files)' }) - 1 : -1
    const forceIdx = checkboxes.push({ label: 'Remove all installed versions' }) - 1
    const snapshotIdx = checkboxes.push({ label: 'Create a local safety snapshot first (Time Machine)' }) - 1

    const zapTrashPaths = pkg.zapTrashPaths ?? []
    const body =
      target.isCask && zapTrashPaths.length > 0
        ? `This removes the package (and its keg/app) from your system. Checking "remove app data" also trashes:\n${zapTrashPaths.join('\n')}`
        : 'This removes the package (and its keg/app) from your system.'

    const { ok, checked } = await confirm({
      title: `Uninstall ${target.name}?`,
      body,
      confirmLabel: 'Uninstall',
      danger: true,
      checkboxes,
    })
    if (!ok) return
    const zap = zapIdx >= 0 && checked[zapIdx]
    const force = checked[forceIdx]
    const snapshot = checked[snapshotIdx]

    setBusy(true)
    if (snapshot) {
      try {
        await api.createSnapshot()
        notify('success', 'Local snapshot created')
      } catch (e) {
        notify('error', String(e))
      }
    }
    await runAction(() => api.uninstall(target.name, target.isCask, zap, force))
    setBusy(false)
    refresh()
  }

  async function doReinstall() {
    if (!target) return
    setBusy(true)
    await runAction(() => api.reinstall(target.name, target.isCask))
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

  async function doLinkToggle() {
    if (!target || !pkg) return
    setBusy(true)
    await runAction(() => (pkg.linked ? api.unlink(target.name) : api.link(target.name, true)))
    setBusy(false)
    refresh()
  }

  async function doReveal() {
    if (!target) return
    try {
      await api.revealPackage(target.name, target.isCask)
    } catch (e) {
      notify('error', String(e))
    }
  }

  const tags = target ? userData.tagsFor(target.name, target.isCask) : []
  const favorite = target ? userData.isFavorite(target.name, target.isCask) : false

  function addTag() {
    const t = tagInput.trim()
    if (!t || !target) return
    if (!tags.includes(t)) {
      void userData.setTags(target.name, target.isCask, [...tags, t])
    }
    setTagInput('')
  }

  function removeTag(t: string) {
    if (!target) return
    void userData.setTags(target.name, target.isCask, tags.filter((x) => x !== t))
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
            <div className="flex items-start gap-2 pr-8">
              <button
                className="btn btn-sm btn-circle btn-ghost mt-0.5"
                onClick={() => userData.toggleFavorite(target.name, target.isCask)}
                aria-label="Toggle favorite"
              >
                <StarIcon filled={favorite} className={`size-4 ${favorite ? 'text-warning' : ''}`} />
              </button>
              <div>
                <h3 className="font-bold text-xl">{pkg.fullName || pkg.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className={`badge badge-sm ${pkg.isCask ? 'badge-accent' : 'badge-primary'} badge-outline`}>
                    {pkg.isCask ? 'cask' : 'formula'}
                  </span>
                  {pkg.installed && <span className="badge badge-sm badge-success badge-outline">installed</span>}
                  {pkg.outdated && <span className="badge badge-sm badge-warning badge-outline">outdated</span>}
                  {pkg.pinned && <span className="badge badge-sm badge-outline">pinned</span>}
                  {!pkg.isCask && pkg.installed && !pkg.linked && (
                    <span className="badge badge-sm badge-warning badge-outline">unlinked</span>
                  )}
                  {pkg.deprecated && <span className="badge badge-sm badge-error badge-outline">deprecated</span>}
                  {pkg.kegOnly && <span className="badge badge-sm badge-ghost">keg-only</span>}
                  {pkg.isCask && pkg.autoUpdates && <span className="badge badge-sm badge-ghost">auto-updates</span>}
                  {tags.map((t) => (
                    <span key={t} className="badge badge-sm badge-neutral gap-1">
                      {t}
                      <button onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`}>
                        <XIcon className="size-2.5" />
                      </button>
                    </span>
                  ))}
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
              {pkg.installed && (
                <button className="link link-hover" onClick={doReveal}>
                  Reveal in Finder
                </button>
              )}
            </div>

            <label className="input input-sm w-full mt-2">
              <TagIcon className="size-3.5 opacity-50" />
              <input
                type="text"
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
            </label>

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
              {pkg.isCask && pkg.installed && (
                <button
                  role="tab"
                  className={`tab ${tab === 'security' ? 'tab-active' : ''}`}
                  onClick={() => {
                    setTab('security')
                    void loadSecurity()
                  }}
                >
                  Security
                </button>
              )}
            </div>

            {tab === 'overview' && (
              <div className="mt-3 space-y-3 text-sm">
                {pkg.caveats && (
                  <div className="alert alert-warning alert-soft text-xs whitespace-pre-wrap">{pkg.caveats}</div>
                )}
                {pkg.isCask && !pkg.installed && (pkg.artifacts?.length ?? 0) > 0 && (
                  <div>
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">
                      What this installs
                    </div>
                    <ul className="text-xs text-base-content/70 list-disc list-inside">
                      {pkg.artifacts.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
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
                {(pkg.dependencies?.length ?? 0) > 0 && (
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
                {(pkg.conflictsWith?.length ?? 0) > 0 && (
                  <div>
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">Conflicts with</div>
                    <div className="flex flex-wrap gap-1">
                      {pkg.conflictsWith.map((d) => (
                        <span key={d} className="badge badge-error badge-outline badge-sm">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="font-medium text-xs uppercase text-base-content/50 mb-1">Note</div>
                  <textarea
                    className="textarea textarea-sm w-full"
                    rows={2}
                    placeholder="Private note (only you see this)…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => void userData.setNote(target.name, target.isCask, note)}
                  />
                </div>
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

            {tab === 'security' && (
              <div className="mt-3 text-sm">
                {securityLoading && (
                  <div className="flex items-center gap-2 text-base-content/60 py-4">
                    <span className="loading loading-spinner loading-xs" /> Inspecting code signature…
                  </div>
                )}
                {securityError && <div className="alert alert-error alert-soft text-xs">{securityError}</div>}
                {security && !securityLoading && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {security.gatekeeperOk ? (
                        <CheckIcon className="size-4 text-success" />
                      ) : (
                        <ShieldIcon className="size-4 text-error" />
                      )}
                      <span>{security.gatekeeperOk ? 'Passes Gatekeeper assessment' : 'Fails Gatekeeper assessment'}</span>
                    </div>
                    <div className="text-xs text-base-content/60 space-y-1">
                      <div>Signed: {security.signed ? 'yes' : 'no'}</div>
                      {security.authority && <div>Authority: {security.authority}</div>}
                      {security.teamId && <div>Team ID: {security.teamId}</div>}
                      <div>Quarantine flag: {security.quarantined ? 'present' : 'cleared'}</div>
                    </div>
                    {security.quarantined && (
                      <button className="btn btn-xs" onClick={doRemoveQuarantine}>
                        Remove quarantine flag
                      </button>
                    )}
                    <pre className="mockup-code text-xs overflow-x-auto max-h-40 mt-2">
                      <code className="whitespace-pre px-4">{security.assessment}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div className="modal-action">
              {!pkg.isCask && pkg.installed && (
                <button className="btn btn-sm" disabled={busy} onClick={doLinkToggle}>
                  <RefreshIcon className="size-4" /> {pkg.linked ? 'Unlink' : 'Link'}
                </button>
              )}
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
              {pkg.installed && (
                <button className="btn btn-sm" disabled={busy} onClick={doReinstall}>
                  <RefreshIcon className="size-4" /> Reinstall
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
