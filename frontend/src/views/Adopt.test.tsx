// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import type { AdoptCandidate } from '../lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))

const runAction = vi.fn(async (fn: () => Promise<string>) => {
  await fn()
  return { status: 'success', lines: [] }
})
vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({ runAction, notify: vi.fn() }),
}))
vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => ({ ok: true, checked: [] })),
}))
vi.mock('../components/PackageDetailModal', () => ({ default: () => null }))

const scanAdoptableApps = vi.fn()
const adoptCask = vi.fn(async () => 'job-1')
vi.mock('../lib/api', () => ({
  api: {
    scanAdoptableApps: () => scanAdoptableApps(),
    adoptCask: (...a: unknown[]) => (adoptCask as (...x: unknown[]) => Promise<string>)(...a),
  },
}))

import Adopt from './Adopt'

function candidate(name: string): AdoptCandidate {
  return {
    appName: name,
    appPath: `/Applications/${name}.app`,
    caskToken: name.toLowerCase(),
    caskDesc: `${name} desc`,
    caskVersion: '1.0',
    installedVersion: '1.0',
    matchConfidence: 'exact',
    matchReason: '',
    possibleDowngrade: false,
    isAppStoreApp: false,
  } as AdoptCandidate
}

beforeEach(() => {
  scanAdoptableApps.mockReset()
  adoptCask.mockClear()
})
afterEach(cleanup)

describe('Adopt', () => {
  it('lists candidates after a scan', async () => {
    scanAdoptableApps.mockResolvedValue([candidate('Alpha'), candidate('Beta')])
    render(<Adopt bump={vi.fn()} />)
    fireEvent.click(screen.getByText('adopt.scanButton'))
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('still shows results when scanning again after adopting one', async () => {
    scanAdoptableApps.mockResolvedValueOnce([candidate('Alpha'), candidate('Beta')])
    const bump = vi.fn()
    render(<Adopt bump={bump} />)
    fireEvent.click(screen.getByText('adopt.scanButton'))
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())

    await act(async () => {
      fireEvent.click(screen.getAllByText('adopt.adoptButton')[0])
    })
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull())
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(bump).toHaveBeenCalled()

    scanAdoptableApps.mockResolvedValueOnce([candidate('Beta'), candidate('Gamma')])
    fireEvent.click(screen.getByText('adopt.scanButton'))
    await waitFor(() => expect(screen.getByText('Gamma')).toBeTruthy())
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('says so when a scan finds nothing', async () => {
    scanAdoptableApps.mockResolvedValue([])
    render(<Adopt bump={vi.fn()} />)
    fireEvent.click(screen.getByText('adopt.scanButton'))
    await waitFor(() => expect(screen.getByText('adopt.nothingToAdopt')).toBeTruthy())
  })
})
