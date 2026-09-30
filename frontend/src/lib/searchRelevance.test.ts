import { describe, expect, it } from 'vitest'
import { rankBySearch, relevanceTier, type Searchable } from './searchRelevance'

const item = (name: string, extra: Partial<Searchable> = {}): Searchable => ({ name, ...extra })

describe('relevanceTier', () => {
  it.each([
    ['exact name', 'rar', item('rar'), 0],
    ['exact name, different case', 'RAR', item('rar'), 0],
    ['exact full name', 'homebrew/cask/rar', item('rar', { fullName: 'homebrew/cask/rar' }), 0],
    ['name starts with the query', 'rar', item('rarcrack'), 1],
    ['name contains the query', 'rar', item('unrar'), 2],
    ['full name contains the query', 'cask', item('rar', { fullName: 'homebrew/cask/rar' }), 3],
    ['description contains the query', 'archiver', item('rar', { desc: 'RAR Archiver' }), 3],
    ['no match', 'zzz', item('rar', { fullName: 'homebrew/cask/rar', desc: 'RAR Archiver' }), -1],
    ['whitespace around the query is ignored', '  rar  ', item('rar'), 0],
  ])('%s', (_label, query, it_, want) => {
    expect(relevanceTier(query, it_)).toBe(want)
  })

  it('treats an empty query as a match for everything', () => {
    expect(relevanceTier('', item('rar'))).toBe(0)
    expect(relevanceTier('   ', item('rar'))).toBe(0)
  })
})

describe('rankBySearch', () => {
  it('puts the exact name first when it would otherwise sort among the others (the rar case)', () => {
    const alphabetical = [
      item('7-zip-rar', { desc: 'unpacks rar' }),
      item('rarcrack'),
      item('rar'),
      item('unrar'),
      item('zrar'),
    ]
    expect(rankBySearch(alphabetical, 'rar').map((i) => i.name)).toEqual([
      'rar',
      'rarcrack',
      '7-zip-rar',
      'unrar',
      'zrar',
    ])
  })

  it('orders exact, then prefix, then name contains, then full name or description', () => {
    const items = [
      item('a', { desc: 'about wget' }),
      item('mywgetfork'),
      item('wget2'),
      item('wget'),
      item('b', { fullName: 'tap/wget-tools/b' }),
    ]
    expect(rankBySearch(items, 'wget').map((i) => i.name)).toEqual(['wget', 'wget2', 'mywgetfork', 'a', 'b'])
  })

  it('keeps the input order within a tier', () => {
    const items = [item('rar-c'), item('rar-a'), item('rar-b')]
    expect(rankBySearch(items, 'rar').map((i) => i.name)).toEqual(['rar-c', 'rar-a', 'rar-b'])
  })

  it('drops items that do not match', () => {
    expect(rankBySearch([item('wget'), item('curl')], 'wget').map((i) => i.name)).toEqual(['wget'])
    expect(rankBySearch([item('wget')], 'nope')).toEqual([])
  })

  it('returns the list unchanged for an empty query', () => {
    const items = [item('b'), item('a')]
    expect(rankBySearch(items, '')).toBe(items)
    expect(rankBySearch(items, '  ')).toBe(items)
  })

  it('does not mutate its input', () => {
    const items = [item('unrar'), item('rar')]
    rankBySearch(items, 'rar')
    expect(items.map((i) => i.name)).toEqual(['unrar', 'rar'])
  })
})
