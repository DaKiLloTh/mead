import type { ComponentChildren, VNode } from 'preact'

interface Props {
  icon?: (p: { className?: string }) => VNode
  children: ComponentChildren
}

/**
 * Centered "nothing here" message shown when a view's list is empty.
 * Found duplicated across views with drifted padding (py-12 vs py-16) and
 * inconsistent icon usage (an icon component in one, a literal "✓" emoji
 * in another, nothing in most) -- standardized here on py-16 and an
 * optional icon component prop.
 */
export default function EmptyState({ icon: Icon, children }: Props) {
  return (
    <div className="text-center text-base-content/50 py-16">
      {Icon && <Icon className="size-8 mx-auto mb-2 opacity-40" />}
      {children}
    </div>
  )
}
