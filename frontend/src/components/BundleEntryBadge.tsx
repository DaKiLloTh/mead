import { useTranslation } from 'react-i18next'
import type { BundleEntryType } from '../lib/api'

interface Props {
  type: BundleEntryType
  /** badge-sm (default) everywhere except compact rows that want badge-xs. */
  size?: 'xs' | 'sm'
  className?: string
}

/**
 * The badge shown next to a Brewfile entry in the Maintenance tab's
 * cleanup preview, extending TypeBadge's formula/cask badge-outline
 * pattern to every entry type `brew bundle` can declare (Homebrew 7 added
 * tap/mas/vscode/go/cargo/uv/flatpak/winget/krew/npm on top of the
 * original formula/cask). Kept as its own component rather than folded
 * into TypeBadge because TypeBadge's `isCask: boolean` prop can't express
 * anything beyond a two-way split -- callers that only ever have a
 * formula/cask boolean (not a full BundleEntryType) should keep using
 * TypeBadge.
 */
const entryTypeClasses: Record<BundleEntryType, string> = {
  formula: 'badge-primary',
  cask: 'badge-secondary',
  tap: 'badge-accent',
  mas: 'badge-info',
  vscode: 'badge-success',
  go: 'badge-warning',
  cargo: 'badge-error',
  uv: 'badge-neutral',
  flatpak: 'badge-primary',
  winget: 'badge-secondary',
  krew: 'badge-accent',
  npm: 'badge-info',
}

const entryTypeLabelKeys: Record<BundleEntryType, string> = {
  formula: 'common.formula',
  cask: 'common.cask',
  tap: 'common.entryTypeTap',
  mas: 'common.entryTypeMas',
  vscode: 'common.entryTypeVscode',
  go: 'common.entryTypeGo',
  cargo: 'common.entryTypeCargo',
  uv: 'common.entryTypeUv',
  flatpak: 'common.entryTypeFlatpak',
  winget: 'common.entryTypeWinget',
  krew: 'common.entryTypeKrew',
  npm: 'common.entryTypeNpm',
}

export default function BundleEntryBadge({ type, size = 'sm', className = '' }: Props) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-${size} badge-outline ${entryTypeClasses[type]} ${className}`}>
      {t(entryTypeLabelKeys[type])}
    </span>
  )
}
