import { describe, expect, it } from 'vitest'
import { deriveChangelogUrl } from './changelog'

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
