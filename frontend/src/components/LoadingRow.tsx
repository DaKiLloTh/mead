import type { ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
}

/**
 * The "spinner + loading message" row shown at the top of every view while
 * its first fetch is in flight. Found identically duplicated (modulo the
 * message) in 11 views.
 */
export default function LoadingRow({ children }: Props) {
  return (
    <div className="flex items-center gap-2 text-base-content/60">
      <span className="loading loading-spinner loading-sm" /> {children}
    </div>
  )
}
