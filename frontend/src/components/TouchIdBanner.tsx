import { useTranslation } from 'react-i18next'
import { FingerprintIcon } from './Icons'

interface Props {
  /** True once Terminal has been opened and we're waiting for the user to finish there. */
  waiting: boolean
  onEnable: () => void
}

/**
 * Offer to turn on Touch ID for sudo, shown on the App Store view. Some
 * App Store updates (Xcode) run sudo internally; without this they can only
 * ask for a typed password. The action itself is confirmed and performed by
 * the caller; this only renders the offer and its "waiting" state.
 */
export default function TouchIdBanner({ waiting, onEnable }: Props) {
  const { t } = useTranslation()
  return (
    <div className="card bg-base-200 border border-primary/30 mb-4">
      <div className="card-body flex-row flex-wrap items-center gap-4 p-4">
        <div className="rounded-box bg-primary/15 text-primary p-2.5 shrink-0">
          <FingerprintIcon className="size-6" />
        </div>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-medium text-sm">{t('appstore.touchIdTitle')}</h2>
          <p className="text-xs text-base-content/60 mt-0.5">
            {waiting ? t('appstore.touchIdWaiting') : t('appstore.touchIdBody')}
          </p>
        </div>
        <button className="btn btn-sm btn-primary shrink-0" disabled={waiting} onClick={onEnable}>
          {waiting && <span className="loading loading-spinner loading-xs" />}
          {t('appstore.touchIdEnable')}
        </button>
      </div>
    </div>
  )
}
