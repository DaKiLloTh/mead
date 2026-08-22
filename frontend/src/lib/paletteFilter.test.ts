import { describe, expect, it } from 'vitest'
import { filterNavItems, filterPackages, matchesQuery } from './paletteFilter'

describe('matchesQuery', () => {
  it('matches case-insensitively', () => {
    expect(matchesQuery('Dashboard', 'dash')).toBe(true)
    expect(matchesQuery('Dashboard', 'DASH')).toBe(true)
  })

  it('matches on substring anywhere in the text', () => {
    expect(matchesQuery('App Store', 'store')).toBe(true)
  })

  it('returns true for an empty/whitespace query regardless of text', () => {
    expect(matchesQuery('Dashboard', '')).toBe(true)
    expect(matchesQuery('Dashboard', '   ')).toBe(true)
    expect(matchesQuery(undefined, '')).toBe(true)
  })

  it('returns false when text is missing but the query is non-empty', () => {
    expect(matchesQuery(undefined, 'x')).toBe(false)
  })

  it('returns false when there is no match', () => {
    expect(matchesQuery('Dashboard', 'zzz')).toBe(false)
  })
})

describe('filterNavItems', () => {
  const items = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'installed', label: 'Installed' },
    { key: 'appstore', label: 'App Store' },
    { key: 'settings', label: 'Settings' },
  ]

  it('returns every item for an empty query (palette empty state)', () => {
    expect(filterNavItems(items, '')).toEqual(items)
  })

  it('filters by label', () => {
    expect(filterNavItems(items, 'store')).toEqual([{ key: 'appstore', label: 'App Store' }])
  })

  it('also matches against the key, so "appstore" finds "App Store"', () => {
    expect(filterNavItems(items, 'appstore')).toEqual([{ key: 'appstore', label: 'App Store' }])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterNavItems(items, 'zzz')).toEqual([])
  })
})

describe('filterPackages', () => {
  const packages = [
    { name: 'wget', fullName: 'wget', isCask: false },
    { name: 'firefox', fullName: 'homebrew/cask/firefox', isCask: true },
    { name: 'git', fullName: 'git', isCask: false },
    { name: 'git-lfs', fullName: 'git-lfs', isCask: false },
  ]

  it('returns no results for an empty query', () => {
    expect(filterPackages(packages, '')).toEqual([])
  })

  it('matches by name substring', () => {
    expect(filterPackages(packages, 'fire')).toEqual([packages[1]])
  })

  it('matches by fullName when name does not match', () => {
    expect(filterPackages(packages, 'homebrew/cask')).toEqual([packages[1]])
  })

  it('returns all matches sharing a common prefix', () => {
    const results = filterPackages(packages, 'git')
    expect(results.map((p) => p.name)).toEqual(['git', 'git-lfs'])
  })

  it('caps results at the given limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `pkg-${i}`, isCask: false }))
    expect(filterPackages(many, 'pkg', 5)).toHaveLength(5)
  })
})
