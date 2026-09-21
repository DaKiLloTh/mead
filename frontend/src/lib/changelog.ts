/**
 * Best-effort "release notes" link for a package, derived from what brew
 * already reports (no fetching or parsing of changelog text -- that scope
 * was explicitly rejected in issue #49 in favor of a cheap outbound link).
 *
 * In order of trust:
 * 1. A "Release notes: <url>" line in the package's own caveats text. The
 *    package author wrote it, so it beats any guess. Not a Homebrew-wide
 *    convention, so it only helps packages that include it (see issue #112),
 *    but it costs nothing when absent.
 * 2. If the homepage points at a GitHub repo (github.com/<owner>/<repo>,
 * optionally with a trailing slash or path), this links straight to that
 * repo's Releases page. Empirically that pattern hits for roughly 70% of
 * formulae and 30% of casks.
 * 3. Otherwise the homepage itself, labelled generically
 *    (`kind: 'homepage'`) since we can't claim it's actually a changelog.
 *
 * Returns null only when there's no homepage and no caveats link, so the
 * caller can skip rendering the section entirely instead of showing a dead
 * link.
 */

export type ChangelogLinkKind = 'releases' | 'homepage'

export interface ChangelogLink {
  url: string
  kind: ChangelogLinkKind
}

// Matches a GitHub repo homepage: github.com/<owner>/<repo>, allowing an
// optional trailing slash or further path segments (e.g. /wiki, /#readme).
const GITHUB_REPO_PATTERN = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:[/?#].*)?$/i

// A caveats line such as `Release notes: https://example.com/changes`. The
// label is matched case-insensitively at the start of a line, the URL may be
// wrapped in angle brackets, and one trailing punctuation mark is dropped.
const CAVEATS_LINK_PATTERN =
  /^[ \t]*(?:release notes|changelog|change log|what'?s new)[ \t]*:[ \t]*<?(https?:\/\/[^\s<>]+?)>?[.,;]?[ \t]*$/im

/** The release-notes URL a package's caveats text names, if any. */
export function changelogUrlFromCaveats(caveats: string | undefined): string | null {
  const match = caveats?.match(CAVEATS_LINK_PATTERN)
  if (!match) return null
  // The pattern only lets http(s) through; URL() rejects what still isn't a URL.
  try {
    return new URL(match[1]).toString()
  } catch {
    return null
  }
}

export function deriveChangelogUrl(pkg: { homepage?: string; caveats?: string }): ChangelogLink | null {
  const fromCaveats = changelogUrlFromCaveats(pkg.caveats)
  if (fromCaveats) return { url: fromCaveats, kind: 'releases' }

  const homepage = pkg.homepage?.trim()
  if (!homepage) return null

  const match = homepage.match(GITHUB_REPO_PATTERN)
  if (match) {
    const [, owner, repo] = match
    return { url: `https://github.com/${owner}/${repo}/releases`, kind: 'releases' }
  }

  return { url: homepage, kind: 'homepage' }
}
