// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/preact'

const refreshInstalledPackages = vi.fn()
const refreshSystemInfo = vi.fn()
const refreshOutdated = vi.fn()
vi.mock('./InstalledPackagesSignal', () => ({ refreshInstalledPackages: () => refreshInstalledPackages() }))
vi.mock('./SystemInfoSignal', () => ({ refreshSystemInfo: () => refreshSystemInfo() }))
vi.mock('./OutdatedSignal', () => ({ refreshOutdated: () => refreshOutdated() }))

import { signal } from '@preact/signals'
import { bump, refreshSignal, useRefreshEffect } from './RefreshSignal'

afterEach(cleanup)

describe('bump', () => {
  it('increments the refresh signal and refreshes the shared caches', () => {
    const before = refreshSignal.value
    bump()
    expect(refreshSignal.value).toBe(before + 1)
    expect(refreshInstalledPackages).toHaveBeenCalled()
    expect(refreshSystemInfo).toHaveBeenCalled()
    expect(refreshOutdated).toHaveBeenCalled()
  })
})

describe('useRefreshEffect', () => {
  it('runs on mount and after every bump, cleaning up in between', async () => {
    const run = vi.fn()
    const cleanupFn = vi.fn()
    function View() {
      useRefreshEffect(() => {
        run()
        return cleanupFn
      })
      return null
    }
    render(<View />)
    await act(async () => {})
    expect(run).toHaveBeenCalledTimes(1)

    await act(async () => bump())
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not re-run when a signal read inside it changes', async () => {
    const other = signal(0)
    const run = vi.fn(() => void other.value)
    function View() {
      useRefreshEffect(run)
      return null
    }
    render(<View />)
    await act(async () => {})
    await act(async () => {
      other.value++
    })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
