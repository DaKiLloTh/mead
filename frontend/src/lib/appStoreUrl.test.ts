import { describe, expect, it } from 'vitest'
import { appStoreUrl } from './appStoreUrl'

describe('appStoreUrl', () => {
  it('builds the macappstore deep link from a numeric id', () => {
    expect(appStoreUrl('409201541')).toBe('macappstore://apps.apple.com/app/id409201541')
  })

  it.each(['', 'abc', '12 34', '123/../456', '123?x=1', '-5', '1e5'])('rejects %j', (id) => {
    expect(appStoreUrl(id)).toBeNull()
  })
})
