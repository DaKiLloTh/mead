import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import ExternalLink from './ExternalLink'
import PackageIcon from './PackageIcon'
import DependencyGraph from './DependencyGraph'

export interface DetailTarget {
  name: string
  isCask: boolean
}

interface Props {
  target: DetailTarget | null
  onClose: () => void
  onChanged?: () => void
}

type Tab = 'overview' | 'deps' | 'graph' | 'security'

export default function PackageDetailModal({ target, onClose, onChanged }: Props) {
  const { t } = useTranslation()
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

  // The currently-displayed package. Usually just `target` (the prop), but
  // clicking a node in the dependency graph swaps this to view a different
  // package's detail *within the same modal* rather than stacking a second
  // one -- see the 'graph' tab below and DependencyGraph's onSelectPackage.
  // Reset to `target` whenever the prop's own identity changes (a new
  // target key means the modal was pointed at a different package from
  // outside) using the "adjust state during render" pattern, so there's
  // never a render with a stale viewTarget in between.
  const [viewTarget, setViewTarget] = useState<DetailTarget | null>(target)
  const targetKey = target ? `${target.name}:${target.isCask}` : null
  const [syncedTargetKey, setSyncedTargetKey] = useState(targetKey)
  if (targetKey !== syncedTargetKey) {
    setSyncedTargetKey(targetKey)
    setViewTarget(target)
  }

  useEffect(() => {
    if (!viewTarget) return
    setLoading(true)
    setTab('overview')
    setUses(null)
    setTree(null)
    setPkg(null)
    setSecurity(null)
    setSecurityError(null)
    setNote(userData.noteFor(viewTarget.name, viewTarget.isCask))
    api
      .getInfo(viewTarget.name, viewTarget.isCask)
      .then(setPkg)
      .catch(() => setPkg(null))
      .finally(() => setLoading(false))
    if (!viewTarget.isCask) {
      api
        .uses(viewTarget.name)
        .then(setUses)
        .catch(() => setUses([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTarget?.name, viewTarget?.isCask])

  if (!target || !viewTarget) return null

  function refresh() {
    if (!viewTarget) return
    api.getInfo(viewTarget.name, viewTarget.isCask).then(setPkg).catch(() => {})
    onChanged?.()
  }

  async function loadTree() {
    if (!viewTarget || tree !== null) return
    setTreeLoading(true)
    try {
      const out = await api.deps(viewTarget.name, viewTarget.isCask)
      setTree(out)
    } catch (e) {
      setTree(String(e))
    } finally {
      setTreeLoading(false)
    }
  }

  async function loadSecurity() {
    if (!viewTarget || security || securityLoading) return
    setSecurityLoading(true)
    setSecurityError(null)
    try {
      const info = await api.inspectCaskSecurity(viewTarget.name)
      setSecurity(info)
    } catch (e) {
      setSecurityError(String(e))
    } finally {
      setSecurityLoading(false)
    }
  }

  async function doRemoveQuarantine() {
    if (!security || !viewTarget) return
    try {
      await api.removeQuarantine(viewTarget.name)
      setSecurity(null)
      void loadSecurity()
    } catch (e) {
      setSecurityError(String(e))
    }
  }

  async function doInstall() {
    if (!viewTarget) return
    setBusy(true)
    await runAction(() => api.install(viewTarget.name, viewTarget.isCask))
    setBusy(false)
    refresh()
  }

  async function doUpgrade() {
    if (!viewTarget) return
    setBusy(true)
    await runAction(() => api.upgrade(viewTarget.name, viewTarget.isCask))
    setBusy(false)
    refresh()
  }

  async function doUninstall() {
    if (!viewTarget || !pkg) return
    const checkboxes: { label: string }[] = []
    const zapIdx = viewTarget.isCask ? checkboxes.push({ label: t('packageDetail.checkboxRemoveAppData') }) - 1 : -1
    const forceIdx = checkboxes.push({ label: t('packageDetail.checkboxRemoveAllVersions') }) - 1
    const snapshotIdx = checkboxes.push({ label: t('packageDetail.checkboxSnapshot') }) - 1

    const zapTrashPaths = pkg.zapTrashPaths ?? []
    const body =
      viewTarget.isCask && zapTrashPaths.length > 0
        ? t('packageDetail.confirmUninstallBodyWithZap', { paths: zapTrashPaths.join('\n') })
        : t('packageDetail.confirmUninstallBody')

    const { ok, checked } = await confirm({
      title: t('packageDetail.confirmUninstallTitle', { name: viewTarget.name }),
      body,
      confirmLabel: t('common.uninstall'),
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
        notify('success', t('packageDetail.localSnapshotCreated'))
      } catch (e) {
        notify('error', String(e))
      }
    }
    await runAction(() => api.uninstall(viewTarget.name, viewTarget.isCask, zap, force))
    setBusy(false)
    refresh()
  }

  async function doReinstall() {
    if (!viewTarget) return
    setBusy(true)
    await runAction(() => api.reinstall(viewTarget.name, viewTarget.isCask))
    setBusy(false)
    refresh()
  }

  async function doPinToggle() {
    if (!viewTarget || !pkg) return
    setBusy(true)
    await runAction(() => (pkg.pinned ? api.unpin(viewTarget.name) : api.pin(viewTarget.name)))
    setBusy(false)
    refresh()
  }

  async function doLinkToggle() {
    if (!viewTarget || !pkg) return
    setBusy(true)
    await runAction(() => (pkg.linked ? api.unlink(viewTarget.name) : api.link(viewTarget.name, true)))
    setBusy(false)
    refresh()
  }

  async function doReveal() {
    if (!viewTarget) return
    try {
      await api.revealPackage(viewTarget.name, viewTarget.isCask)
    } catch (e) {
      notify('error', String(e))
    }
  }

  const tags = userData.tagsFor(viewTarget.name, viewTarget.isCask)
  const favorite = userData.isFavorite(viewTarget.name, viewTarget.isCask)

  function addTag() {
    const t = tagInput.trim()
    if (!t || !viewTarget) return
    if (!tags.includes(t)) {
      void userData.setTags(viewTarget.name, viewTarget.isCask, [...tags, t])
    }
    setTagInput('')
  }

  function removeTag(t: string) {
    if (!viewTarget) return
    void userData.setTags(viewTarget.name, viewTarget.isCask, tags.filter((x) => x !== t))
  }

  return (
    <dialog className="modal modal-open">
      <div className={`modal-box ${tab === 'graph' ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
          onClick={onClose}
          aria-label={t('packageDetail.closeAriaLabel')}
        >
          <XIcon className="size-4" />
        </button>

        {loading && (
          <div className="flex items-center gap-2 text-base-content/60 py-8 justify-center">
            <span className="loading loading-spinner loading-sm" /> {t('packageDetail.loading')}
          </div>
        )}

        {!loading && !pkg && <div className="py-8 text-center text-base-content/60">{t('packageDetail.notLoaded')}</div>}

        {!loading && pkg && (
          <>
            <div className="flex items-start gap-3 pr-8">
              <PackageIcon name={viewTarget.name} isCask={viewTarget.isCask} className="size-10 mt-0.5" />
              <button
                className="btn btn-sm btn-circle btn-ghost mt-0.5"
                onClick={() => userData.toggleFavorite(viewTarget.name, viewTarget.isCask)}
                aria-label={t('packageDetail.toggleFavoriteAriaLabel')}
              >
                <StarIcon filled={favorite} className={`size-4 ${favorite ? 'text-warning' : ''}`} />
              </button>
              <div>
                <h3 className="font-bold text-xl">{pkg.fullName || pkg.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className={`badge badge-sm ${pkg.isCask ? 'badge-accent' : 'badge-primary'} badge-outline`}>
                    {pkg.isCask ? t('common.cask') : t('common.formula')}
                  </span>
                  {pkg.installed && <span className="badge badge-sm badge-success badge-outline">{t('common.badgeInstalled')}</span>}
                  {pkg.outdated && <span className="badge badge-sm badge-warning badge-outline">{t('common.badgeOutdated')}</span>}
                  {pkg.pinned && <span className="badge badge-sm badge-outline">{t('common.badgePinned')}</span>}
                  {!pkg.isCask && pkg.installed && !pkg.linked && (
                    <span className="badge badge-sm badge-warning badge-outline">{t('common.badgeUnlinked')}</span>
                  )}
                  {pkg.deprecated && <span className="badge badge-sm badge-error badge-outline">{t('common.badgeDeprecated')}</span>}
                  {pkg.kegOnly && <span className="badge badge-sm badge-ghost">{t('common.badgeKegOnly')}</span>}
                  {pkg.isCask && pkg.autoUpdates && <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>}
                  {tags.map((tag) => (
                    <span key={tag} className="badge badge-sm badge-neutral gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} aria-label={t('packageDetail.removeTagAriaLabel', { tag })}>
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
                  {t('packageDetail.latestLabel')} <span className="font-mono">{pkg.version}</span>
                </span>
              )}
              {pkg.installedVersion && (
                <span>
                  {t('packageDetail.installedLabel')} <span className="font-mono">{pkg.installedVersion}</span>
                </span>
              )}
              {pkg.license && <span>{t('packageDetail.license', { license: pkg.license })}</span>}
              {pkg.tap && <span>{t('packageDetail.tap', { tap: pkg.tap })}</span>}
              {pkg.homepage && (
                <ExternalLink className="link link-hover inline-flex items-center gap-1" href={pkg.homepage}>
                  {t('packageDetail.homepage')} <ExternalLinkIcon className="size-3" />
                </ExternalLink>
              )}
              {pkg.installed && (
                <button className="link link-hover" onClick={doReveal}>
                  {t('packageDetail.revealInFinder')}
                </button>
              )}
            </div>

            <label className="input input-sm w-full mt-2">
              <TagIcon className="size-3.5 opacity-50" />
              <input
                type="text"
                placeholder={t('packageDetail.tagPlaceholder')}
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
                {t('packageDetail.tabOverview')}
              </button>
              <button
                role="tab"
                className={`tab ${tab === 'deps' ? 'tab-active' : ''}`}
                onClick={() => {
                  setTab('deps')
                  void loadTree()
                }}
              >
                {t('packageDetail.tabDependencies')}
              </button>
              <button
                role="tab"
                className={`tab ${tab === 'graph' ? 'tab-active' : ''}`}
                onClick={() => setTab('graph')}
              >
                {t('packageDetail.tabDependencyGraph')}
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
                  {t('packageDetail.tabSecurity')}
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
                      {t('packageDetail.whatThisInstalls')}
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">{t('packageDetail.usedBy')}</div>
                    {uses === null ? (
                      <span className="text-base-content/50 text-xs">{t('common.loading')}</span>
                    ) : uses.length === 0 ? (
                      <span className="text-base-content/50 text-xs">{t('packageDetail.usedByNone')}</span>
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">{t('packageDetail.dependsOn')}</div>
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">{t('packageDetail.conflictsWith')}</div>
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
                  <div className="font-medium text-xs uppercase text-base-content/50 mb-1">{t('packageDetail.noteLabel')}</div>
                  <textarea
                    className="textarea textarea-sm w-full"
                    rows={2}
                    placeholder={t('packageDetail.notePlaceholder')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => void userData.setNote(viewTarget.name, viewTarget.isCask, note)}
                  />
                </div>
              </div>
            )}

            {tab === 'deps' && (
              <div className="mt-3">
                {treeLoading ? (
                  <div className="flex items-center gap-2 text-base-content/60 text-sm py-4">
                    <span className="loading loading-spinner loading-xs" /> {t('packageDetail.loadingDepTree')}
                  </div>
                ) : (
                  <pre className="mockup-code text-xs overflow-x-auto max-h-72">
                    <code className="whitespace-pre px-4">{tree || t('packageDetail.noDependencies')}</code>
                  </pre>
                )}
              </div>
            )}

            {tab === 'graph' && (
              <DependencyGraph target={viewTarget} onSelectPackage={(t) => setViewTarget(t)} />
            )}

            {tab === 'security' && (
              <div className="mt-3 text-sm">
                {securityLoading && (
                  <div className="flex items-center gap-2 text-base-content/60 py-4">
                    <span className="loading loading-spinner loading-xs" /> {t('packageDetail.inspectingSignature')}
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
                      <span>{security.gatekeeperOk ? t('packageDetail.gatekeeperPass') : t('packageDetail.gatekeeperFail')}</span>
                    </div>
                    <div className="text-xs text-base-content/60 space-y-1">
                      <div>{t('packageDetail.signed', { value: security.signed ? t('packageDetail.yes') : t('packageDetail.no') })}</div>
                      {security.authority && <div>{t('packageDetail.authority', { authority: security.authority })}</div>}
                      {security.teamId && <div>{t('packageDetail.teamId', { teamId: security.teamId })}</div>}
                      <div>
                        {t('packageDetail.quarantineFlag', {
                          value: security.quarantined ? t('packageDetail.quarantinePresent') : t('packageDetail.quarantineCleared'),
                        })}
                      </div>
                    </div>
                    {security.quarantined && (
                      <button className="btn btn-xs" onClick={doRemoveQuarantine}>
                        {t('packageDetail.removeQuarantine')}
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
                  <RefreshIcon className="size-4" /> {pkg.linked ? t('common.unlink') : t('common.link')}
                </button>
              )}
              {!pkg.isCask && pkg.installed && (
                <button className="btn btn-sm" disabled={busy} onClick={doPinToggle}>
                  <PinIcon className="size-4" /> {pkg.pinned ? t('common.unpin') : t('common.pin')}
                </button>
              )}
              {pkg.installed && pkg.outdated && (
                <button className="btn btn-sm btn-warning" disabled={busy} onClick={doUpgrade}>
                  <ArrowUpCircleIcon className="size-4" /> {t('common.upgrade')}
                </button>
              )}
              {pkg.installed && (
                <button className="btn btn-sm" disabled={busy} onClick={doReinstall}>
                  <RefreshIcon className="size-4" /> {t('common.reinstall')}
                </button>
              )}
              {pkg.installed ? (
                <button className="btn btn-sm btn-error" disabled={busy} onClick={doUninstall}>
                  <TrashIcon className="size-4" /> {t('common.uninstall')}
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={doInstall}>
                  <DownloadIcon className="size-4" /> {t('common.install')}
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
