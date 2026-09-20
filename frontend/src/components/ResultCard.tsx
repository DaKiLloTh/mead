import type { ComponentChildren } from 'preact'

interface Props {
  title: ComponentChildren
  description?: string
  /** Badges and link buttons at the right of the header. Clicks here never reach `onClick`. */
  headerRight?: ComponentChildren
  /** Makes the whole card a hover-highlighted click target. */
  onClick?: () => void
  /** Extra content between the header and the footer. */
  children?: ComponentChildren
  /** Rendered as-is, so the caller supplies its own wrapper element. */
  footerLeft?: ComponentChildren
  footerRight?: ComponentChildren
}

/**
 * The bordered card shared by Search results and Adopt candidates: a header
 * (title, description, badges), an optional body, and a footer split into
 * facts on the left and an action on the right. Found copy-pasted between
 * SearchResultCard and Adopt during a repo review. What goes in each slot
 * stays with the caller since it differs by domain.
 */
export default function ResultCard({
  title,
  description,
  headerRight,
  onClick,
  children,
  footerLeft,
  footerRight,
}: Props) {
  return (
    <div
      className={`rounded-box border border-base-300 p-4 flex flex-col gap-2${onClick ? ' hover:bg-base-200/60 transition-colors cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium wrap-break-word">{title}</div>
          {description && <div className="text-xs text-base-content/50 wrap-break-word">{description}</div>}
        </div>
        {headerRight && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </div>

      {children}

      <div className="border-t border-base-300/50 pt-2 flex items-center justify-between gap-3 flex-wrap">
        {footerLeft}
        {footerRight}
      </div>
    </div>
  )
}
