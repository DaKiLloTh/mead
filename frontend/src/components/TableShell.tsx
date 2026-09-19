import type { ComponentChildren, VNode } from 'preact'

interface Props {
  colgroup?: VNode | (VNode | false | null)[]
  children: ComponentChildren
}

/**
 * The overflow/border/table-sizing wrapper shared by every package/app/
 * service table in the app (Installed, Updates, Maintenance x2, AppStore,
 * Services) -- found copy-pasted identically in all 6 during a repo review.
 * Row/column content stays with each view since those genuinely differ by
 * domain (BrewPackage vs MasApp vs Service); this only extracts the shell
 * that never did.
 */
export default function TableShell({ colgroup, children }: Props) {
  return (
    <div className="overflow-x-auto rounded-box border border-base-300">
      <table className="table table-sm table-fixed">
        {colgroup && <colgroup>{colgroup}</colgroup>}
        {children}
      </table>
    </div>
  )
}
