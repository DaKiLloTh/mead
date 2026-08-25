import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, OutdatedPackage } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useUserData } from '../context/UserDataContext'
import { useOutdated } from '../context/OutdatedContext'
import PackageDetailModal, { DetailTarget } from '../components/PackageDetailModal'
import { ArrowUpCircleIcon, ClockIcon, RefreshIcon } from '../components/Icons'

interface Props {
  refreshToken: number
  bump: () => void
}

const SNOOZE_OPTIONS = [
  { labelKey: 'updates.snoozeOneDay', days: 1 },
  { labelKey: 'updates.snoozeOneWeek', days: 7 },
  { labelKey: 'updates.snoozeOneMonth', days: 30 },
]

export default function Updates({ refreshToken, bump }: Props) {
  const { t } = useTranslation()
  const { runAction } = useJobs()
  const userData = useUserData()
  // Non-greedy reads from the shared OutdatedContext cache (same source the
  // sidebar badge uses), rather than this view running its own independent
  // `api.outdated()` fetch -- two separate fetches racing to resolve is
  // exactly what made the sidebar badge and this page's own count disagree
  // for a moment after every refresh, even with nothing snoozed (issue
  // #124). The greedy toggle below is a genuinely different query
  // (`--greedy` pulls in a superset Homebrew normally excludes), so it
  // isn't served by the shared cache and still runs its own fetch, only
  // while active.
  const outdated = useOutdated()
  const [greedyItems, setGreedyItems] = useState<OutdatedPackage[]>([])
  const [greedyLoading, setGreedyLoading] = useState(false)
  const [greedyError, setGreedyError] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [upgradingAll, setUpgradingAll] = useState(false)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [greedy, setGreedy] = useState(false)
  const [detail, setDetail] = useState<DetailTarget | null>(null)

  const items = greedy ? greedyItems : outdated.items ?? []
  const loading = greedy ? greedyLoading : outdated.loading
  const error = greedy ? greedyError : outdated.error

  function loadGreedy() {
    setGreedyLoading(true)
    setGreedyError(null)
    api
      .outdated(true)
      .then(setGreedyItems)
      .catch((e) => setGreedyError(String(e)))
      .finally(() => setGreedyLoading(false))
  }

  // load() is what the Refresh button and post-mutation call sites reach
  // for: refresh whichever source is currently active. For the non-greedy
  // case that's the shared cache's own refresh(), so a manual refresh here
  // also keeps the sidebar badge in sync, not just this page.
  function load() {
    if (greedy) loadGreedy()
    else outdated.refresh()
  }

  useEffect(() => {
    if (greedy) loadGreedy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greedy, refreshToken])

  const { visible, snoozed } = useMemo(() => {
    const visible: OutdatedPackage[] = []
    const snoozed: OutdatedPackage[] = []
    for (const p of items) {
      if (userData.snoozedUntil(p.name, p.isCask)) {
        snoozed.push(p)
      } else {
        visible.push(p)
      }
    }
    return { visible, snoozed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, userData.data])

  // bump() already covers the non-greedy refresh via the shared cache's
  // refresh(); only the greedy-specific fetch needs an explicit call here,
  // to avoid firing two outdated fetches back to back in the common case.
  async function upgradeOne(p: OutdatedPackage) {
    setRowBusy(p.name)
    await runAction(() => api.upgrade(p.name, p.isCask))
    setRowBusy(null)
    if (greedy) loadGreedy()
    bump()
  }

  async function upgradeAll() {
    setUpgradingAll(true)
    await runAction(() => api.upgradeAll(greedy))
    setUpgradingAll(false)
    if (greedy) loadGreedy()
    bump()
  }

  const list = showSnoozed ? snoozed : visible

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{t('updates.title')}</h1>
          <p className="text-base-content/60 text-sm">
            {error
              ? t('updates.subtitleError')
              : visible.length === 0
              ? t('updates.subtitleUpToDate')
              : t('updates.subtitleCanUpgrade', { count: visible.length })}
            {!error && snoozed.length > 0 && t('updates.subtitleSnoozedSuffix', { count: snoozed.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="label cursor-pointer gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={greedy}
              onChange={(e) => setGreedy(e.target.checked)}
            />
            <span className="label-text">{t('updates.includeAutoUpdatingCasks')}</span>
          </label>
          {snoozed.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setShowSnoozed((s) => !s)}>
              <ClockIcon className="size-4" />{' '}
              {showSnoozed ? t('updates.showActive') : t('updates.showSnoozed', { count: snoozed.length })}
            </button>
          )}
          <button className="btn btn-sm" disabled={loading} onClick={load}>
            <RefreshIcon className="size-4" /> {t('common.refresh')}
          </button>
          {!showSnoozed && visible.length > 0 && (
            <button className="btn btn-sm btn-primary" disabled={upgradingAll} onClick={upgradeAll}>
              {upgradingAll ? <span className="loading loading-spinner loading-xs" /> : <ArrowUpCircleIcon className="size-4" />}
              {t('common.upgradeAll')}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="alert alert-error alert-soft">
          <div>
            <div className="font-medium">{t('updates.errorTitle')}</div>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> {t('updates.checking')}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center text-base-content/50 py-16">
          <div className="text-4xl mb-2">✓</div>
          {showSnoozed ? t('updates.nothingSnoozed') : t('updates.nothingToUpdate')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm table-fixed">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('updates.colName')}</th>
                <th>{t('updates.colType')}</th>
                <th>{t('updates.colInstalled')}</th>
                <th>{t('updates.colLatest')}</th>
                <th className="text-right">{t('updates.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={`${p.isCask ? 'c' : 'f'}:${p.name}`} className="hover:bg-base-200">
                  <td
                    className="font-medium truncate cursor-pointer"
                    onClick={() => setDetail({ name: p.name, isCask: p.isCask })}
                  >
                    {p.name}
                  </td>
                  <td>
                    <span className={`badge badge-sm badge-outline ${p.isCask ? 'badge-accent' : 'badge-primary'}`}>
                      {p.isCask ? t('common.cask') : t('common.formula')}
                    </span>
                  </td>
                  <td className="font-mono text-xs truncate" title={p.installedVersions.join(', ')}>
                    {p.installedVersions.join(', ')}
                  </td>
                  <td className="font-mono text-xs text-warning truncate" title={p.currentVersion}>
                    {p.currentVersion}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {showSnoozed ? (
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            userData.unsnooze(p.name, p.isCask)
                          }}
                        >
                          {t('updates.unsnooze')}
                        </button>
                      ) : p.pinned ? (
                        <span className="badge badge-ghost badge-sm">{t('common.badgePinned')}</span>
                      ) : (
                        <>
                          <div className="dropdown dropdown-end">
                            <div
                              tabIndex={0}
                              role="button"
                              className="btn btn-xs btn-ghost"
                              title={t('updates.snoozeTooltip')}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ClockIcon className="size-3.5" />
                            </div>
                            <ul tabIndex={0} className="dropdown-content menu menu-sm bg-base-100 rounded-box z-10 w-32 p-1 shadow border border-base-300">
                              {SNOOZE_OPTIONS.map((o) => (
                                <li key={o.days}>
                                  <a
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      userData.snooze(p.name, p.isCask, o.days)
                                    }}
                                  >
                                    {t(o.labelKey)}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <button
                            className="btn btn-xs btn-primary"
                            disabled={rowBusy === p.name}
                            onClick={(e) => {
                              e.stopPropagation()
                              upgradeOne(p)
                            }}
                          >
                            {rowBusy === p.name ? <span className="loading loading-spinner loading-xs" /> : t('common.upgrade')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PackageDetailModal
        target={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          if (greedy) loadGreedy()
          bump()
        }}
      />
    </div>
  )
}
