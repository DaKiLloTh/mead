/**
 * Best-effort "release notes" link for a package, derived from whatever
 * homepage URL brew already reports (no fetching or parsing of changelog
 * text -- that scope was explicitly rejected in issue #49 in favor of a
 * cheap outbound link).
 *
 * If the homepage points at a GitHub repo (github.com/<owner>/<repo>,
 * optionally with a trailing slash or path), this links straight to that
 * repo's Releases page. Empirically that pattern hits for roughly 70% of
 * formulae and 30% of casks -- when it doesn't match, this falls back to
 * the homepage itself, labelled generically (`kind: 'homepage'`) since we
 * can't claim it's actually a changelog. Returns null only when there's no
 * homepage to fall back to, so the caller can skip rendering the section
 * entirely instead of showing a dead link.
 */

export type ChangelogLinkKind = 'releases' | 'homepage'

export interface ChangelogLink {
  url: string
  kind: ChangelogLinkKind
}

// Matches a GitHub repo homepage: github.com/<owner>/<repo>, allowing an
// optional trailing slash or further path segments (e.g. /wiki, /#readme).
const GITHUB_REPO_PATTERN = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:[/?#].*)?$/i

export function deriveChangelogUrl(pkg: { homepage?: string }): ChangelogLink | null {
  const homepage = pkg.homepage?.trim()
  if (!homepage) return null

  const match = homepage.match(GITHUB_REPO_PATTERN)
  if (match) {
    const [, owner, repo] = match
    return { url: `https://github.com/${owner}/${repo}/releases`, kind: 'releases' }
  }

  return { url: homepage, kind: 'homepage' }
}
