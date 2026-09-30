import { useTranslation } from 'react-i18next'
import type { VulnSeverity } from '../lib/api'

interface Props {
  severity: VulnSeverity
  /** badge-sm (default) everywhere except compact rows that want badge-xs. */
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * The severity badge for one vulnerability finding, as `brew vulns`
 * reports it (critical/high/medium/low, or "unknown" when it can't
 * determine one). Critical is rendered solid rather than outlined so the
 * most urgent findings stand out at a glance in a list that's otherwise
 * all badge-outline (matching TypeBadge/BundleEntryBadge's visual
 * language elsewhere in the app).
 */
const severityClasses: Record<VulnSeverity, string> = {
  critical: 'badge-error',
  high: 'badge-error badge-outline',
  medium: 'badge-warning badge-outline',
  low: 'badge-info badge-outline',
  unknown: 'badge-neutral badge-outline',
}

const severityLabelKeys: Record<VulnSeverity, string> = {
  critical: 'security.severityCritical',
  high: 'security.severityHigh',
  medium: 'security.severityMedium',
  low: 'security.severityLow',
  unknown: 'security.severityUnknown',
}

export default function SeverityBadge({ severity, size = 'sm', className = '' }: Props) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-${size} ${severityClasses[severity]} ${className}`}>
      {t(severityLabelKeys[severity])}
    </span>
  )
}
