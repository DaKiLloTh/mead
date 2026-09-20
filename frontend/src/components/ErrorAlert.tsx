import { useTranslation } from 'react-i18next'
import { RefreshIcon } from './Icons'

interface Props {
  title: string
  message: string
  /** When given, shows a "Try again" button that calls it. */
  onRetry?: () => void
  className?: string
}

/**
 * The error callout shown at the top of a view when its data failed to load:
 * a title, the error text, and optionally a retry button. Found hand-written
 * in seven views, four with a retry button and three without.
 */
export default function ErrorAlert({ title, message, onRetry, className = '' }: Props) {
  const { t } = useTranslation()
  return (
    <div className={`alert alert-error alert-soft ${className}`.trim()}>
      <div>
        <div className="font-medium">{title}</div>
        <p className="text-sm mt-1">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <RefreshIcon className="size-4" /> {t('common.tryAgain')}
        </button>
      )}
    </div>
  )
}
