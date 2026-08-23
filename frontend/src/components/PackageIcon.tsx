import { useCaskIcon } from '../lib/useCaskIcon'
import { monogramFor } from '../lib/monogram'

interface Props {
  name: string
  isCask: boolean
  /** Tailwind sizing classes, e.g. "size-5" -- defaults to a list-row size. */
  className?: string
}

/**
 * A package's icon: the real app icon for an installed cask when one can be
 * extracted (see useCaskIcon), otherwise a deterministic colored monogram
 * tile (see lib/monogram.ts) -- the shared fallback for formulae, which
 * never have an app/icon at all, and for any cask whose icon extraction
 * failed for any reason. Used by the Installed list, the package detail
 * modal, and the Applications grid, so the icon logic only lives once.
 */
export default function PackageIcon({ name, isCask, className = 'size-5' }: Props) {
  const icon = useCaskIcon(name, isCask)

  if (icon) {
    return <img src={icon} alt="" className={`${className} rounded-md object-contain shrink-0 bg-base-100`} />
  }

  const { letter, bg, fg } = monogramFor(name)
  return (
    <div
      className={`${className} rounded-md flex items-center justify-center font-semibold shrink-0 select-none`}
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden="true"
    >
      {letter}
    </div>
  )
}
