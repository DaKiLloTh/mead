import { useTranslation } from 'react-i18next'

interface Props {
  isCask: boolean
  /** badge-sm (default) everywhere except CommandPalette's compact result rows, which use badge-xs. */
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * The "cask"/"formula" badge shown next to a package's name. Extracted
 * after the same `badge-outline ${isCask ? 'badge-secondary' : 'badge-primary'}`
 * markup turned up copy-pasted in 6 places with one already-drifted class
 * order (PackageDetailModal had badge-outline last instead of first) --
 * one component means that can't happen again.
 */
export default function TypeBadge({ isCask, size = 'sm', className = '' }: Props) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-${size} badge-outline ${isCask ? 'badge-secondary' : 'badge-primary'} ${className}`}>
      {isCask ? t('common.cask') : t('common.formula')}
    </span>
  )
}
