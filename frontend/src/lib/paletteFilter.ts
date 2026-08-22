// Pure, dependency-free fuzzy-ish matching used by the command palette
// (CommandPalette.tsx). Kept separate from the component so it can be
// unit tested without touching React/DOM.

export interface PaletteNavItem {
  key: string
  label: string
}

export interface PalettePackage {
  name: string
  fullName?: string
  isCask: boolean
}

/** Case-insensitive substring match. Empty query matches everything. */
export function matchesQuery(text: string | undefined, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (!text) return false
  return text.toLowerCase().includes(q)
}

/**
 * Filter navigable views by label (and key, so e.g. "appstore" still finds
 * "App Store"). With an empty query every item is returned, so the palette
 * can show the full nav list as its empty state.
 */
export function filterNavItems<T extends PaletteNavItem>(items: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return items
  return items.filter((item) => matchesQuery(item.label, q) || matchesQuery(item.key, q))
}

/**
 * Filter installed packages (formulae + casks) by name/fullName. With an
 * empty query nothing is returned — the palette shouldn't dump the entire
 * installed list when the user hasn't typed anything.
 */
export function filterPackages<T extends PalettePackage>(packages: T[], query: string, limit = 8): T[] {
  const q = query.trim()
  if (!q) return []
  return packages.filter((p) => matchesQuery(p.name, q) || matchesQuery(p.fullName, q)).slice(0, limit)
}
