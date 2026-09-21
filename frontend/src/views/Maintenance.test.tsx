// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ runAction: vi.fn(), notify: vi.fn() }) }))
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))

const { cacheInfo, largestInstalledPackages, scanLeftovers } = vi.hoisted(() => ({
  cacheInfo: vi.fn(),
  largestInstalledPackages: vi.fn(),
  scanLeftovers: vi.fn(),
}))
vi.mock('../lib/api', () => ({ api: { cacheInfo, largestInstalledPackages, scanLeftovers } }))

import Maintenance from './Maintenance'

// A promise the test resolves by hand, so the view stays in its loading state.
function pending<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const spinners = (root: Element) => root.querySelectorAll('.loading-spinner').length

describe('Maintenance loading state', () => {
  it('shows a single spinner while the largest packages load', async () => {
    cacheInfo.mockResolvedValue({ path: '/cache', sizeHuman: '1 GB' })
    const largest = pending<never[]>()
    largestInstalledPackages.mockReturnValue(largest.promise)
    const { container } = render(<Maintenance />)
    fireEvent.click(screen.getByText('maintenance.tabCleanup', { exact: false }))
    await waitFor(() => expect(screen.getByText('common.refresh')).toBeTruthy())
    // The Refresh button already shows the loading state and is disabled.
    expect((screen.getByText('common.refresh').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect(spinners(container)).toBe(1)
    largest.resolve([])
    await waitFor(() => expect(spinners(container)).toBe(0))
  })

  it('shows a single spinner while leftovers are scanned', async () => {
    cacheInfo.mockResolvedValue({ path: '/cache', sizeHuman: '1 GB' })
    largestInstalledPackages.mockResolvedValue([])
    const scan = pending<never[]>()
    scanLeftovers.mockReturnValue(scan.promise)
    const { container } = render(<Maintenance />)
    fireEvent.click(screen.getByText('maintenance.tabLeftovers', { exact: false }))
    const button = screen.getByText('maintenance.scanLeftovers').closest('button') as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(button.disabled).toBe(true))
    expect(spinners(container)).toBe(1)
    scan.resolve([])
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(spinners(container)).toBe(0)
  })
})
