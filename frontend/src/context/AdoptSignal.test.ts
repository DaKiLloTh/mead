import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdoptCandidate } from '../lib/api'

const scanAdoptableApps = vi.fn()
vi.mock('../lib/api', () => ({ api: { scanAdoptableApps: () => scanAdoptableApps() } }))

import { adoptSignal, scanAdoptable } from './AdoptSignal'
import { initialAdoptState } from './adoptCache'

beforeEach(() => {
  scanAdoptableApps.mockReset()
  adoptSignal.value = initialAdoptState
})

describe('scanAdoptable', () => {
  it('ignores a second scan while one is running', async () => {
    let resolve!: (v: AdoptCandidate[]) => void
    scanAdoptableApps.mockReturnValueOnce(new Promise((r) => (resolve = r)))

    const first = scanAdoptable()
    await scanAdoptable()
    resolve([])
    await first

    expect(scanAdoptableApps).toHaveBeenCalledTimes(1)
    expect(adoptSignal.value).toEqual({ items: [], scanning: false, error: null })
  })
})
