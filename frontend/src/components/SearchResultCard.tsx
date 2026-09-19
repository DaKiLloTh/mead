import { useTranslation } from 'react-i18next'
import type { SearchResult } from '../lib/api'
import ExternalLink from './ExternalLink'
import TypeBadge from './TypeBadge'
import { BadgeBrokenIcon, BadgeInstalledIcon, DownloadIcon, ExternalLinkIcon, TapIcon } from './Icons'

// The two official taps every formula/cask not from a third party belongs
// to. Anything else means the result comes from a tap Homebrew itself
// doesn't vet -- worth flagging on a search result specifically, since
// that's the one place in the app someone might install something they've
// never heard of before.
const OFFICIAL_TAPS = new Set(['homebrew/core', 'homebrew/cask'])

function formulaeBrewShUrl(r: SearchResult): string {
  return `https://formulae.brew.sh/${r.isCask ? 'cask' : 'formula'}/${encodeURIComponent(r.name)}`
}

interface Props {
  result: SearchResult
  installed: boolean
  busy: boolean
  onOpenDetail: () => void
  onInstall: () => void
}

/**
 * One row in Search's result list. Extracted out of Search.tsx (where this
 * used to be inline JSX inside the results .map()) so it's independently
 * reusable and storyable -- Search.tsx now just supplies the data and the
 * two callbacks.
 */
export default function SearchResultCard({ result: r, installed, busy, onOpenDetail, onInstall }: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="rounded-box border border-base-300 p-4 flex flex-col gap-2 hover:bg-base-200/60 transition-colors cursor-pointer"
      onClick={onOpenDetail}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium wrap-break-word">{r.name}</div>
          {r.desc && <div className="text-xs text-base-content/50 wrap-break-word">{r.desc}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {r.homepage && (
            <ExternalLink
              href={r.homepage}
              className="btn btn-ghost btn-xs btn-square"
              title={t('search.homepageLink')}
            >
              <ExternalLinkIcon className="size-3.5" />
            </ExternalLink>
          )}
          <ExternalLink
            href={formulaeBrewShUrl(r)}
            className="btn btn-ghost btn-xs btn-square"
            title={t('search.formulaeBrewShLink')}
          >
            <TapIcon className="size-3.5" />
          </ExternalLink>
          <TypeBadge isCask={r.isCask} />
        </div>
      </div>

      <div className="border-t border-base-300/50 pt-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {r.version && <span className="font-mono text-xs text-base-content/60">{r.version}</span>}
          {r.tap && !OFFICIAL_TAPS.has(r.tap.toLowerCase()) && (
            <span
              className="badge badge-sm badge-warning badge-outline gap-1"
              title={t('search.nonStandardTapTooltip')}
            >
              <TapIcon className="size-3" />
              {r.tap}
            </span>
          )}
          {r.deprecated && (
            <span className="badge badge-sm badge-error badge-outline gap-1">
              <BadgeBrokenIcon className="size-3" />
              {t('common.badgeDeprecated')}
            </span>
          )}
          {r.disabled && <span className="badge badge-sm badge-error gap-1">{t('common.badgeDisabled')}</span>}
          {r.isCask && r.autoUpdates && (
            <span className="badge badge-sm badge-ghost">{t('common.badgeAutoUpdates')}</span>
          )}
        </div>

        {installed ? (
          <span className="badge badge-success badge-outline shrink-0 gap-1">
            <BadgeInstalledIcon className="size-3" />
            {t('common.badgeInstalled')}
          </span>
        ) : (
          <button
            className="btn btn-xs btn-primary shrink-0"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onInstall()
            }}
          >
            {busy ? <span className="loading loading-spinner loading-xs" /> : <DownloadIcon className="size-3.5" />}
            {t('common.install')}
          </button>
        )}
      </div>
    </div>
  )
}
