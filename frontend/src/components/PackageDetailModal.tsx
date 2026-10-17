import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { api, BrewPackage, PreInstallSecurityInfo, SecurityInfo } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'
import {
  ArrowUpCircleIcon,
  BadgeBrokenIcon,
  BadgeInstalledIcon,
  BadgeOutdatedIcon,
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
import TypeBadge from './TypeBadge'
import DependencyGraph from './DependencyGraph'
import { deriveChangelogUrl } from '../lib/changelog'
import { useUninstall } from '../lib/useUninstall'

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
  if (!target) return null
  // Keyed on the target so every open, and every switch to a different
  // package from outside, starts with fresh state. Nothing from a previous
  // package can render while the new one loads.
  return (
    <PackageDetail key={`${target.name}:${target.isCask}`} target={target} onClose={onClose} onChanged={onChanged} />
  )
}

function PackageDetail({ target, onClose, onChanged }: Props & { target: DetailTarget }) {
  const { t } = useTranslation()
  const { runAction, notify } = useJobs()
  const confirm = useConfirm()
  const uninstallWithElevation = useUninstall()
  const userData = useUserData()
  // The fetched package, tagged with the key it was fetched for. pkg and
  // loading are derived from it so a result from a previous target (the
  // modal stays mounted while closed) or a late response for a package the
  // user has since moved away from never renders against the current one.
  const loaded = useSignal<{ key: string; pkg: BrewPackage | null } | null>(null)
  const tab = useSignal<Tab>('overview')
  const uses = useSignal<string[] | null>(null)
  const tree = useSignal<string | null>(null)
  const treeLoading = useSignal(false)
  const busy = useSignal(false)
  const tagInput = useSignal('')
  const note = useSignal('')
  const security = useSignal<SecurityInfo | null>(null)
  const securityLoading = useSignal(false)
  const securityError = useSignal<string | null>(null)
  const preInstallSecurity = useSignal<PreInstallSecurityInfo | null>(null)
  const preInstallLoading = useSignal(false)
  const preInstallError = useSignal<string | null>(null)

  // The currently-displayed package. Starts as `target`, but clicking a
  // node in the dependency graph swaps this to view a different package's
  // detail *within the same modal* rather than stacking a second one -- see
  // the 'graph' tab below and DependencyGraph's onSelectPackage.
  const viewTarget = useSignal<DetailTarget>(target)
  const viewKey = `${viewTarget.value.name}:${viewTarget.value.isCask}`
  const loading = loaded.value?.key !== viewKey
  const pkg = !loading && loaded.value ? loaded.value.pkg : null

  useEffect(() => {
    tab.value = 'overview'
    uses.value = null
    tree.value = null
    security.value = null
    securityError.value = null
    preInstallSecurity.value = null
    preInstallError.value = null
    note.value = userData.noteFor(viewTarget.value.name, viewTarget.value.isCask)
    api
      .getInfo(viewTarget.value.name, viewTarget.value.isCask)
      .then((p) => (loaded.value = { key: viewKey, pkg: p }))
      .catch(() => (loaded.value = { key: viewKey, pkg: null }))
    if (!viewTarget.value.isCask) {
      api
        .uses(viewTarget.value.name)
        .then((v) => (uses.value = v))
        .catch(() => (uses.value = []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  function refresh() {
    api
      .getInfo(viewTarget.value.name, viewTarget.value.isCask)
      .then((p) => (loaded.value = { key: viewKey, pkg: p }))
      .catch(() => {})
    onChanged?.()
  }

  async function loadTree() {
    if (tree.value !== null) return
    treeLoading.value = true
    try {
      const out = await api.deps(viewTarget.value.name, viewTarget.value.isCask)
      tree.value = out
    } catch (e) {
      tree.value = String(e)
    } finally {
      treeLoading.value = false
    }
  }

  async function loadSecurity() {
    if (security.value || securityLoading.value) return
    securityLoading.value = true
    securityError.value = null
    try {
      const info = await api.inspectCaskSecurity(viewTarget.value.name)
      security.value = info
    } catch (e) {
      securityError.value = String(e)
    } finally {
      securityLoading.value = false
    }
  }

  async function verifyBeforeInstall() {
    const { ok } = await confirm({
      title: t('packageDetail.verifyBeforeInstallConfirmTitle'),
      body: t('packageDetail.verifyBeforeInstallConfirmBody'),
      confirmLabel: t('packageDetail.verifyBeforeInstallConfirmLabel'),
    })
    if (!ok) return
    preInstallLoading.value = true
    preInstallError.value = null
    try {
      const info = await api.inspectCaskBeforeInstall(viewTarget.value.name)
      preInstallSecurity.value = info
    } catch (e) {
      preInstallError.value = String(e)
    } finally {
      preInstallLoading.value = false
    }
  }

  async function doRemoveQuarantine() {
    if (!security.value) return
    try {
      await api.removeQuarantine(viewTarget.value.name)
      security.value = null
      void loadSecurity()
    } catch (e) {
      securityError.value = String(e)
    }
  }

  async function doInstall() {
    busy.value = true
    await runAction(() => api.install(viewTarget.value.name, viewTarget.value.isCask))
    busy.value = false
    refresh()
  }

  async function doUpgrade() {
    busy.value = true
    await runAction(() => api.upgrade(viewTarget.value.name, viewTarget.value.isCask))
    busy.value = false
    refresh()
  }

  async function doUninstall() {
    if (!pkg) return
    const checkboxes: { label: string }[] = []
    const zapIdx = viewTarget.value.isCask
      ? checkboxes.push({ label: t('packageDetail.checkboxRemoveAppData') }) - 1
      : -1
    const forceIdx = checkboxes.push({ label: t('packageDetail.checkboxRemoveAllVersions') }) - 1
    const snapshotIdx = checkboxes.push({ label: t('packageDetail.checkboxSnapshot') }) - 1

    const zapTrashPaths = pkg.zapTrashPaths ?? []
    const body =
      viewTarget.value.isCask && zapTrashPaths.length > 0
        ? t('packageDetail.confirmUninstallBodyWithZap', { paths: zapTrashPaths.join('\n') })
        : t('packageDetail.confirmUninstallBody')

    const { ok, checked } = await confirm({
      title: t('packageDetail.confirmUninstallTitle', { name: viewTarget.value.name }),
      body,
      confirmLabel: t('common.uninstall'),
      danger: true,
      checkboxes,
    })
    if (!ok) return
    const zap = zapIdx >= 0 && checked[zapIdx]
    const force = checked[forceIdx]
    const snapshot = checked[snapshotIdx]

    busy.value = true
    if (snapshot) {
      try {
        await api.createSnapshot()
        notify('success', t('packageDetail.localSnapshotCreated'))
      } catch (e) {
        notify('error', String(e))
      }
    }
    await uninstallWithElevation(
      { name: viewTarget.value.name, isCask: viewTarget.value.isCask, zap, force },
      {
        title: t('packageDetail.elevateUninstallTitle'),
        body: t('packageDetail.elevateUninstallBody'),
        confirmLabel: t('packageDetail.elevateUninstallConfirmLabel'),
      }
    )
    busy.value = false
    refresh()
  }

  async function doReinstall() {
    busy.value = true
    await runAction(() => api.reinstall(viewTarget.value.name, viewTarget.value.isCask))
    busy.value = false
    refresh()
  }

  async function doPinToggle() {
    if (!pkg) return
    busy.value = true
    await runAction(() => (pkg.pinned ? api.unpin(viewTarget.value.name) : api.pin(viewTarget.value.name)))
    busy.value = false
    refresh()
  }

  async function doLinkToggle() {
    if (!pkg) return
    busy.value = true
    await runAction(() => (pkg.linked ? api.unlink(viewTarget.value.name) : api.link(viewTarget.value.name, true)))
    busy.value = false
    refresh()
  }

  async function doReveal() {
    try {
      await api.revealPackage(viewTarget.value.name, viewTarget.value.isCask)
    } catch (e) {
      notify('error', String(e))
    }
  }

  const tags = userData.tagsFor(viewTarget.value.name, viewTarget.value.isCask)
  const favorite = userData.isFavorite(viewTarget.value.name, viewTarget.value.isCask)

  function addTag() {
    const t = tagInput.value.trim()
    if (!t) return
    if (!tags.includes(t)) {
      void userData.setTags(viewTarget.value.name, viewTarget.value.isCask, [...tags, t])
    }
    tagInput.value = ''
  }

  function removeTag(t: string) {
    void userData.setTags(
      viewTarget.value.name,
      viewTarget.value.isCask,
      tags.filter((x) => x !== t)
    )
  }

  const changelogLink = pkg ? deriveChangelogUrl(pkg) : null

  return (
    <dialog className="modal modal-open">
      <div className={`modal-box ${tab.value === 'graph' ? 'max-w-4xl' : 'max-w-2xl'}`}>
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

        {!loading && !pkg && (
          <div className="py-8 text-center text-base-content/60">{t('packageDetail.notLoaded')}</div>
        )}

        {!loading && pkg && (
          <>
            <div className="flex items-start gap-3 pr-8">
              <PackageIcon name={viewTarget.value.name} isCask={viewTarget.value.isCask} className="size-10 mt-0.5" />
              <button
                className="btn btn-sm btn-circle btn-ghost mt-0.5"
                onClick={() => userData.toggleFavorite(viewTarget.value.name, viewTarget.value.isCask)}
                aria-label={t('packageDetail.toggleFavoriteAriaLabel')}
              >
                <StarIcon filled={favorite} className={`size-4 ${favorite ? 'text-warning' : ''}`} />
              </button>
              <div>
                <h3 className="font-bold text-xl">{pkg.fullName || pkg.name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <TypeBadge isCask={pkg.isCask} />
                  {pkg.installed && (
                    <span className="badge badge-sm badge-success badge-outline gap-1">
                      <BadgeInstalledIcon className="size-3" />
                      {t('common.badgeInstalled')}
                    </span>
                  )}
                  {pkg.outdated && (
                    <span className="badge badge-sm badge-warning badge-outline gap-1">
                      <BadgeOutdatedIcon className="size-3" />
                      {t('common.badgeOutdated')}
                    </span>
                  )}
                  {pkg.pinned && <span className="badge badge-sm badge-outline">{t('common.badgePinned')}</span>}
                  {!pkg.isCask && pkg.installed && !pkg.linked && (
                    <span className="badge badge-sm badge-warning badge-outline">{t('common.badgeUnlinked')}</span>
                  )}
                  {pkg.deprecated && (
                    <span className="badge badge-sm badge-error badge-outline gap-1">
                      <BadgeBrokenIcon className="size-3" />
                      {t('common.badgeDeprecated')}
                    </span>
                  )}
                  {pkg.kegOnly && <span className="badge badge-sm badge-ghost">{t('common.badgeKegOnly')}</span>}
                  {pkg.isCask && pkg.autoUpdates && (
                    <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>
                  )}
                  {tags.map((tag) => (
                    <span key={tag} className="badge badge-sm badge-neutral gap-1">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        aria-label={t('packageDetail.removeTagAriaLabel', { tag })}
                      >
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
              {changelogLink && (
                <ExternalLink className="link link-hover inline-flex items-center gap-1" href={changelogLink.url}>
                  {t(changelogLink.kind === 'releases' ? 'packageDetail.releaseNotes' : 'packageDetail.homepage')}{' '}
                  <ExternalLinkIcon className="size-3" />
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
                value={tagInput.value}
                onChange={(e) => (tagInput.value = e.currentTarget.value)}
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
                className={`tab ${tab.value === 'overview' ? 'tab-active' : ''}`}
                onClick={() => (tab.value = 'overview')}
              >
                {t('packageDetail.tabOverview')}
              </button>
              <button
                role="tab"
                className={`tab ${tab.value === 'deps' ? 'tab-active' : ''}`}
                onClick={() => {
                  tab.value = 'deps'
                  void loadTree()
                }}
              >
                {t('packageDetail.tabDependencies')}
              </button>
              <button
                role="tab"
                className={`tab ${tab.value === 'graph' ? 'tab-active' : ''}`}
                onClick={() => (tab.value = 'graph')}
              >
                {t('packageDetail.tabDependencyGraph')}
              </button>
              {pkg.isCask && (
                <button
                  role="tab"
                  className={`tab ${tab.value === 'security' ? 'tab-active' : ''}`}
                  onClick={() => {
                    tab.value = 'security'
                    if (pkg.installed) void loadSecurity()
                  }}
                >
                  {t('packageDetail.tabSecurity')}
                </button>
              )}
            </div>

            {tab.value === 'overview' && (
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">
                      {t('packageDetail.usedBy')}
                    </div>
                    {uses.value === null ? (
                      <span className="text-base-content/50 text-xs">{t('common.loading')}</span>
                    ) : uses.value.length === 0 ? (
                      <span className="text-base-content/50 text-xs">{t('packageDetail.usedByNone')}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {uses.value.map((u) => (
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">
                      {t('packageDetail.dependsOn')}
                    </div>
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
                    <div className="font-medium text-xs uppercase text-base-content/50 mb-1">
                      {t('packageDetail.conflictsWith')}
                    </div>
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
                  <div className="font-medium text-xs uppercase text-base-content/50 mb-1">
                    {t('packageDetail.noteLabel')}
                  </div>
                  <textarea
                    className="textarea textarea-sm w-full"
                    rows={2}
                    placeholder={t('packageDetail.notePlaceholder')}
                    value={note.value}
                    onChange={(e) => (note.value = e.currentTarget.value)}
                    onBlur={() => void userData.setNote(viewTarget.value.name, viewTarget.value.isCask, note.value)}
                  />
                </div>
              </div>
            )}

            {tab.value === 'deps' && (
              <div className="mt-3">
                {treeLoading.value ? (
                  <div className="flex items-center gap-2 text-base-content/60 text-sm py-4">
                    <span className="loading loading-spinner loading-xs" /> {t('packageDetail.loadingDepTree')}
                  </div>
                ) : (
                  <pre className="mockup-code text-xs overflow-x-auto max-h-72">
                    <code className="whitespace-pre px-4">{tree.value || t('packageDetail.noDependencies')}</code>
                  </pre>
                )}
              </div>
            )}

            {tab.value === 'graph' && (
              <DependencyGraph target={viewTarget.value} onSelectPackage={(t) => (viewTarget.value = t)} />
            )}

            {tab.value === 'security' && pkg.installed && (
              <div className="mt-3 text-sm">
                {securityLoading.value && (
                  <div className="flex items-center gap-2 text-base-content/60 py-4">
                    <span className="loading loading-spinner loading-xs" /> {t('packageDetail.inspectingSignature')}
                  </div>
                )}
                {securityError.value && (
                  <div className="alert alert-error alert-soft text-xs">{securityError.value}</div>
                )}
                {security.value && !securityLoading.value && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {security.value.gatekeeperOk ? (
                        <CheckIcon className="size-4 text-success" />
                      ) : (
                        <ShieldIcon className="size-4 text-error" />
                      )}
                      <span>
                        {security.value.gatekeeperOk
                          ? t('packageDetail.gatekeeperPass')
                          : t('packageDetail.gatekeeperFail')}
                      </span>
                    </div>
                    <div className="text-xs text-base-content/60 space-y-1">
                      <div>
                        {t('packageDetail.signed', {
                          value: security.value.signed ? t('packageDetail.yes') : t('packageDetail.no'),
                        })}
                      </div>
                      {security.value.authority && (
                        <div>{t('packageDetail.authority', { authority: security.value.authority })}</div>
                      )}
                      {security.value.teamId && (
                        <div>{t('packageDetail.teamId', { teamId: security.value.teamId })}</div>
                      )}
                      <div>
                        {t('packageDetail.quarantineFlag', {
                          value: security.value.quarantined
                            ? t('packageDetail.quarantinePresent')
                            : t('packageDetail.quarantineCleared'),
                        })}
                      </div>
                    </div>
                    {security.value.quarantined && (
                      <button className="btn btn-xs" onClick={doRemoveQuarantine}>
                        {t('packageDetail.removeQuarantine')}
                      </button>
                    )}
                    <pre className="mockup-code text-xs overflow-x-auto max-h-40 mt-2">
                      <code className="whitespace-pre px-4">{security.value.assessment}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}

            {tab.value === 'security' && !pkg.installed && (
              <div className="mt-3 text-sm space-y-3">
                <p className="text-xs text-base-content/60">{t('packageDetail.verifyBeforeInstallExplainer')}</p>
                {!preInstallSecurity.value && !preInstallLoading.value && (
                  <button className="btn btn-sm" onClick={verifyBeforeInstall}>
                    <ShieldIcon className="size-4" /> {t('packageDetail.verifyBeforeInstallButton')}
                  </button>
                )}
                {preInstallLoading.value && (
                  <div className="flex items-center gap-2 text-base-content/60 py-4">
                    <span className="loading loading-spinner loading-xs" /> {t('packageDetail.verifyingBeforeInstall')}
                  </div>
                )}
                {preInstallError.value && (
                  <div className="alert alert-error alert-soft text-xs">{preInstallError.value}</div>
                )}
                {preInstallSecurity.value && !preInstallLoading.value && (
                  <div className="space-y-2">
                    {!preInstallSecurity.value.unsupported && (
                      <div className="flex items-center gap-2">
                        {preInstallSecurity.value.gatekeeperOk ? (
                          <CheckIcon className="size-4 text-success" />
                        ) : (
                          <ShieldIcon className="size-4 text-error" />
                        )}
                        <span>
                          {preInstallSecurity.value.gatekeeperOk
                            ? t('packageDetail.gatekeeperPass')
                            : t('packageDetail.gatekeeperFail')}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-base-content/60 space-y-1">
                      {preInstallSecurity.value.downloadSizeHuman && (
                        <div>
                          {t('packageDetail.downloadSize', { size: preInstallSecurity.value.downloadSizeHuman })}
                        </div>
                      )}
                      {!preInstallSecurity.value.unsupported && (
                        <>
                          <div>
                            {t('packageDetail.signed', {
                              value: preInstallSecurity.value.signed ? t('packageDetail.yes') : t('packageDetail.no'),
                            })}
                          </div>
                          {preInstallSecurity.value.authority && (
                            <div>{t('packageDetail.authority', { authority: preInstallSecurity.value.authority })}</div>
                          )}
                          {preInstallSecurity.value.teamId && (
                            <div>{t('packageDetail.teamId', { teamId: preInstallSecurity.value.teamId })}</div>
                          )}
                          <div>
                            {t('packageDetail.notarized', {
                              value: preInstallSecurity.value.notarized
                                ? t('packageDetail.yes')
                                : t('packageDetail.no'),
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    {preInstallSecurity.value.note && (
                      <div className="alert alert-warning alert-soft text-xs">{preInstallSecurity.value.note}</div>
                    )}
                    {preInstallSecurity.value.assessment && (
                      <pre className="mockup-code text-xs overflow-x-auto max-h-40 mt-2">
                        <code className="whitespace-pre px-4">{preInstallSecurity.value.assessment}</code>
                      </pre>
                    )}
                    <button className="btn btn-xs" onClick={verifyBeforeInstall}>
                      {t('packageDetail.verifyBeforeInstallAgain')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="modal-action">
              {!pkg.isCask && pkg.installed && (
                <button className="btn btn-sm" disabled={busy.value} onClick={doLinkToggle}>
                  <RefreshIcon className="size-4" /> {pkg.linked ? t('common.unlink') : t('common.link')}
                </button>
              )}
              {!pkg.isCask && pkg.installed && (
                <button className="btn btn-sm" disabled={busy.value} onClick={doPinToggle}>
                  <PinIcon className="size-4" /> {pkg.pinned ? t('common.unpin') : t('common.pin')}
                </button>
              )}
              {pkg.installed && pkg.outdated && (
                <button className="btn btn-sm btn-warning" disabled={busy.value} onClick={doUpgrade}>
                  <ArrowUpCircleIcon className="size-4" /> {t('common.upgrade')}
                </button>
              )}
              {pkg.installed && (
                <button className="btn btn-sm" disabled={busy.value} onClick={doReinstall}>
                  <RefreshIcon className="size-4" /> {t('common.reinstall')}
                </button>
              )}
              {pkg.installed ? (
                <button className="btn btn-sm btn-error" disabled={busy.value} onClick={doUninstall}>
                  <TrashIcon className="size-4" /> {t('common.uninstall')}
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={busy.value} onClick={doInstall}>
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
