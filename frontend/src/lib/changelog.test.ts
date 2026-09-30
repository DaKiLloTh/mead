import { describe, expect, it } from 'vitest'
import { changelogUrlFromCaveats, deriveChangelogUrl } from './changelog'

describe('deriveChangelogUrl', () => {
  it('derives a GitHub releases link from a github.com homepage', () => {
    expect(deriveChangelogUrl({ homepage: 'https://github.com/owner/repo' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
  })

  it('derives a releases link when the homepage has a trailing slash', () => {
    expect(deriveChangelogUrl({ homepage: 'https://github.com/owner/repo/' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
  })

  it('derives a releases link when the homepage has a trailing path', () => {
    expect(deriveChangelogUrl({ homepage: 'https://github.com/owner/repo/wiki' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
  })

  it('strips a trailing .git suffix', () => {
    expect(deriveChangelogUrl({ homepage: 'https://github.com/owner/repo.git' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
  })

  it('matches www.github.com too', () => {
    expect(deriveChangelogUrl({ homepage: 'https://www.github.com/owner/repo' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
  })

  it('falls back to the homepage itself for a non-github homepage', () => {
    expect(deriveChangelogUrl({ homepage: 'https://example.com' })).toEqual({
      url: 'https://example.com',
      kind: 'homepage',
    })
  })

  it('returns null when there is no homepage', () => {
    expect(deriveChangelogUrl({})).toBeNull()
  })

  it('returns null for a blank homepage', () => {
    expect(deriveChangelogUrl({ homepage: '   ' })).toBeNull()
  })

  it('does not treat a github.io homepage as a github.com repo', () => {
    expect(deriveChangelogUrl({ homepage: 'https://owner.github.io/repo' })).toEqual({
      url: 'https://owner.github.io/repo',
      kind: 'homepage',
    })
  })
})

describe('changelogUrlFromCaveats', () => {
  it.each([
    ['a plain line', 'Release notes: https://getmead.app/changelog', 'https://getmead.app/changelog'],
    ['no space after the colon', 'Release notes:https://example.com/r', 'https://example.com/r'],
    ['case-insensitive label', 'RELEASE NOTES: https://example.com/r', 'https://example.com/r'],
    ['the changelog label', 'Changelog: https://example.com/c', 'https://example.com/c'],
    ['the change log label', 'Change log: https://example.com/c', 'https://example.com/c'],
    ["the what's new label", "What's new: https://example.com/n", 'https://example.com/n'],
    ['the whats new label', 'Whats new: https://example.com/n', 'https://example.com/n'],
    ['angle brackets', 'Release notes: <https://example.com/r>', 'https://example.com/r'],
    ['a trailing full stop', 'Release notes: https://example.com/r.', 'https://example.com/r'],
    ['leading whitespace', '   \tRelease notes: https://example.com/r', 'https://example.com/r'],
    ['among other lines', 'mead is pre-alpha.\nRelease notes: https://example.com/r\nThanks.', 'https://example.com/r'],
    ['a url with a query and path', 'Changelog: https://example.com/a/b?x=1&y=2', 'https://example.com/a/b?x=1&y=2'],
    [
      'the first of two labelled lines',
      'Changelog: https://a.example/1\nRelease notes: https://b.example/2',
      'https://a.example/1',
    ],
  ])('reads %s', (_label, caveats, want) => {
    expect(changelogUrlFromCaveats(caveats)).toBe(want)
  })

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['no label', 'Visit https://example.com/r for details'],
    ['a label with no url', 'Release notes: coming soon'],
    ['the label mid-line', 'See the Release notes: https://example.com/r'],
    ['a javascript url', 'Release notes: javascript:alert(1)'],
    ['a file url', 'Release notes: file:///etc/passwd'],
    ['text after the url on the same line', 'Release notes: https://example.com/r and more'],
    ['something that looks like a url but is not one', 'Release notes: https://['],
  ])('finds nothing in %s', (_label, caveats) => {
    expect(changelogUrlFromCaveats(caveats)).toBeNull()
  })
})

describe('deriveChangelogUrl with caveats', () => {
  it('prefers a link the package names over a github homepage guess', () => {
    expect(
      deriveChangelogUrl({
        homepage: 'https://github.com/owner/repo',
        caveats: 'Release notes: https://owner.example/changes',
      })
    ).toEqual({ url: 'https://owner.example/changes', kind: 'releases' })
  })

  it('fixes the case that motivated it: a marketing-site homepage with release notes in the caveats', () => {
    expect(
      deriveChangelogUrl({
        homepage: 'https://getmead.app',
        caveats: 'mead is pre-alpha software.\nRelease notes: https://github.com/DaKiLloTh/mead/releases',
      })
    ).toEqual({ url: 'https://github.com/DaKiLloTh/mead/releases', kind: 'releases' })
  })

  it('works with no homepage at all', () => {
    expect(deriveChangelogUrl({ caveats: 'Changelog: https://example.com/c' })).toEqual({
      url: 'https://example.com/c',
      kind: 'releases',
    })
  })

  it('falls back to the homepage guess when the caveats have no link', () => {
    expect(deriveChangelogUrl({ homepage: 'https://github.com/owner/repo', caveats: 'Restart your shell.' })).toEqual({
      url: 'https://github.com/owner/repo/releases',
      kind: 'releases',
    })
    expect(deriveChangelogUrl({ homepage: 'https://example.com', caveats: 'Restart your shell.' })).toEqual({
      url: 'https://example.com',
      kind: 'homepage',
    })
  })

  it('returns null with neither a homepage nor a caveats link', () => {
    expect(deriveChangelogUrl({ caveats: 'Restart your shell.' })).toBeNull()
  })
})
