import { useTranslation } from 'react-i18next'
import { ArrowUpCircleIcon } from './Icons'

interface Props {
  /** The on-disk version to restart into, as reported by api.updateAvailable(). */
  version: string
  onRestart: () => void
}

/**
 * Persistent, non-blocking notice that mead's own on-disk bundle was
 * replaced (by `brew upgrade --cask mead`, run by the user or by Homebrew
 * itself) while this process was still running the old version. Shown
 * globally in App.tsx, above every view, rather than scoped to one -- the
 * user could be anywhere when this happens.
 *
 * Deliberately never auto-dismisses and never auto-restarts: mead does not
 * silently update anything (see issue #54), it only notices an update that
 * already happened on disk and offers a one-click restart to pick it up.
 * Unlike Toasts.tsx (which the user can click away, and which represents a
 * one-off event that's already over), this stays up for the rest of the
 * session until the user actually restarts, since the condition it reports
 * -- "the code now running doesn't match the code on disk" -- remains true
 * the whole time.
 */
export default function RestartBanner({ version, onRestart }: Props) {
  const { t } = useTranslation()
  return (
    <div className="alert alert-info rounded-none justify-center gap-4 py-2 shrink-0">
      <ArrowUpCircleIcon className="size-4" />
      <span className="text-sm">{t('app.restartBanner.message', { version })}</span>
      <button className="btn btn-sm btn-primary" onClick={onRestart}>
        {t('app.restartBanner.restartButton')}
      </button>
    </div>
  )
}
