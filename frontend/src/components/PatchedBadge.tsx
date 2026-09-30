import { useTranslation } from 'react-i18next'
import { CheckIcon } from './Icons'

interface Props {
  /** badge-sm (default) everywhere except compact rows that want badge-xs. */
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * Marks a vulnerability `brew vulns` reports as already resolved by the
 * formula's own patch -- real, and worth showing so it isn't confused with
 * "not checked", but deliberately *not* styled like an open finding's
 * SeverityBadge, since it isn't counted as one. Mirrors brew vulns' own
 * CLI text output, which calls these out the same way ("resolved by
 * formula patches (not counted; pass --no-ignore-patches to include)").
 */
export default function PatchedBadge({ size = 'sm', className = '' }: Props) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-${size} badge-outline badge-success gap-1 ${className}`}>
      <CheckIcon className="size-3" />
      {t('security.patchedBadge')}
    </span>
  )
}
