export interface Searchable {
  name: string
  fullName?: string
  desc?: string
}

/**
 * Relevance buckets for the Installed page's search box, best first. They
 * mirror internal/brew/searchrank.go (exact, prefix, substring) so the two
 * search boxes agree on what "most relevant" means, with one addition: a
 * package that only matches through its full name or description ranks below
 * every name match instead of sorting in among them.
 *
 * -1 means no match at all.
 */
export function relevanceTier(query: string, item: Searchable): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const name = item.name.toLowerCase()
  const fullName = item.fullName?.toLowerCase() ?? ''
  if (name === q || fullName === q) return 0
  if (name.startsWith(q)) return 1
  if (name.includes(q)) return 2
  if (fullName.includes(q) || (item.desc?.toLowerCase().includes(q) ?? false)) return 3
  return -1
}

/**
 * Drops the items that don't match query and orders the rest by relevance
 * tier. Within a tier the input order is kept, so a list that arrives
 * alphabetically stays alphabetical among equally relevant matches. An empty
 * query returns the list unchanged.
 */
export function rankBySearch<T extends Searchable>(items: T[], query: string): T[] {
  if (!query.trim()) return items
  return items
    .map((item, index) => ({ item, index, tier: relevanceTier(query, item) }))
    .filter((r) => r.tier >= 0)
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((r) => r.item)
}
