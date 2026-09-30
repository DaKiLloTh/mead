// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import type { BrewPackage, PreInstallSecurityInfo, SecurityInfo } from '../lib/api'
import { fakePackage } from '../../.storybook/mocks/wailsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))

vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({ runAction: vi.fn(), notify: vi.fn() }),
}))

const confirmMock = vi.fn(async () => ({ ok: true, checked: [] }))
vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => confirmMock,
}))

vi.mock('../context/UserDataContext', () => ({
  useUserData: () => ({
    data: null,
    refresh: vi.fn(),
    isFavorite: () => false,
    toggleFavorite: vi.fn(async () => {}),
    tagsFor: () => [],
    setTags: vi.fn(async () => {}),
    noteFor: () => '',
    setNote: vi.fn(async () => {}),
    snoozedUntil: () => null,
    snooze: vi.fn(async () => {}),
    unsnooze: vi.fn(async () => {}),
    allTags: [],
  }),
}))

// Both pull in heavy machinery (cytoscape, backend icon extraction) that's
// tangential to what's under test here -- stubbed out the same way
// AppStore.test.tsx stubs PackageIcon.
vi.mock('./DependencyGraph', () => ({ default: () => null }))
vi.mock('./PackageIcon', () => ({ default: () => null }))

const getInfo = vi.fn()
const uses = vi.fn(async () => [] as string[])
const inspectCaskSecurity = vi.fn()
const inspectCaskBeforeInstall = vi.fn()
const removeQuarantine = vi.fn(async () => {})
vi.mock('../lib/api', () => ({
  api: {
    getInfo: (...a: unknown[]) => (getInfo as (...x: unknown[]) => Promise<BrewPackage>)(...a),
    uses: (...a: unknown[]) => (uses as (...x: unknown[]) => Promise<string[]>)(...a),
    deps: vi.fn(async () => ''),
    revealPackage: vi.fn(async () => {}),
    inspectCaskSecurity: (...a: unknown[]) => (inspectCaskSecurity as (...x: unknown[]) => Promise<SecurityInfo>)(...a),
    inspectCaskBeforeInstall: (...a: unknown[]) =>
      (inspectCaskBeforeInstall as (...x: unknown[]) => Promise<PreInstallSecurityInfo>)(...a),
    removeQuarantine: (...a: unknown[]) => (removeQuarantine as (...x: unknown[]) => Promise<void>)(...a),
    install: vi.fn(async () => 'job-1'),
    upgrade: vi.fn(async () => 'job-1'),
    reinstall: vi.fn(async () => 'job-1'),
    uninstall: vi.fn(async () => 'job-1'),
    uninstallElevated: vi.fn(async () => 'job-1'),
    pin: vi.fn(async () => 'job-1'),
    unpin: vi.fn(async () => 'job-1'),
    link: vi.fn(async () => 'job-1'),
    unlink: vi.fn(async () => 'job-1'),
    createSnapshot: vi.fn(async () => {}),
  },
}))

import PackageDetailModal from './PackageDetailModal'

function preInstallInfo(overrides: Partial<PreInstallSecurityInfo> = {}): PreInstallSecurityInfo {
  return {
    caskToken: 'thing',
    container: 'dmg',
    downloadPath: '/tmp/thing.dmg',
    downloadSizeBytes: 35899246,
    downloadSizeHuman: '34.2 MiB',
    signed: true,
    authority: 'Developer ID Application: Some Vendor (ABCDE12345)',
    teamId: 'ABCDE12345',
    notarized: true,
    gatekeeperOk: true,
    assessment: 'accepted\nsource=Notarized Developer ID',
    unsupported: false,
    note: '',
    ...overrides,
  } as PreInstallSecurityInfo
}

beforeEach(() => {
  getInfo.mockReset()
  uses.mockReset()
  uses.mockResolvedValue([])
  inspectCaskSecurity.mockReset()
  inspectCaskBeforeInstall.mockReset()
  removeQuarantine.mockReset()
  confirmMock.mockReset()
  confirmMock.mockResolvedValue({ ok: true, checked: [] })
})
afterEach(cleanup)

describe('PackageDetailModal security tab', () => {
  it('offers a pre-install verify action for a cask that is not installed, and does not auto-fetch', async () => {
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: false }))
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('packageDetail.tabSecurity')).toBeTruthy())
    fireEvent.click(screen.getByText('packageDetail.tabSecurity'))

    expect(await screen.findByText('packageDetail.verifyBeforeInstallButton')).toBeTruthy()
    expect(inspectCaskBeforeInstall).not.toHaveBeenCalled()
  })

  it('does not show a Security tab for a formula', async () => {
    getInfo.mockResolvedValue(fakePackage('wget', false, { installed: false }))
    render(<PackageDetailModal target={{ name: 'wget', isCask: false }} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('packageDetail.tabOverview')).toBeTruthy())
    expect(screen.queryByText('packageDetail.tabSecurity')).toBeNull()
  })

  it('confirms before downloading, and does nothing if the user cancels', async () => {
    confirmMock.mockResolvedValue({ ok: false, checked: [] })
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: false }))
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('packageDetail.tabSecurity'))
    fireEvent.click(await screen.findByText('packageDetail.verifyBeforeInstallButton'))

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(inspectCaskBeforeInstall).not.toHaveBeenCalled()
  })

  it('downloads and shows a signed, notarized result after confirming', async () => {
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: false }))
    inspectCaskBeforeInstall.mockResolvedValue(preInstallInfo())
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('packageDetail.tabSecurity'))
    fireEvent.click(await screen.findByText('packageDetail.verifyBeforeInstallButton'))

    await waitFor(() => expect(inspectCaskBeforeInstall).toHaveBeenCalledWith('thing'))
    expect(await screen.findByText('packageDetail.gatekeeperPass')).toBeTruthy()
    expect(screen.getByText('packageDetail.downloadSize')).toBeTruthy()
    expect(screen.getByText('packageDetail.notarized')).toBeTruthy()
  })

  it('shows an unsupported note without signed/authority fields for a container mead cannot inspect', async () => {
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: false }))
    inspectCaskBeforeInstall.mockResolvedValue(
      preInstallInfo({
        unsupported: true,
        note: "mead doesn't know how to inspect this download's file type yet",
        signed: false,
        gatekeeperOk: false,
        authority: '',
        teamId: '',
        notarized: false,
        assessment: '',
      })
    )
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('packageDetail.tabSecurity'))
    fireEvent.click(await screen.findByText('packageDetail.verifyBeforeInstallButton'))

    expect(await screen.findByText("mead doesn't know how to inspect this download's file type yet")).toBeTruthy()
    expect(screen.queryByText('packageDetail.gatekeeperPass')).toBeNull()
    expect(screen.queryByText('packageDetail.gatekeeperFail')).toBeNull()
  })

  it('shows an error if the inspection call fails', async () => {
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: false }))
    inspectCaskBeforeInstall.mockRejectedValue(new Error('brew fetch failed: no such cask'))
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('packageDetail.tabSecurity'))
    fireEvent.click(await screen.findByText('packageDetail.verifyBeforeInstallButton'))

    expect(await screen.findByText('Error: brew fetch failed: no such cask')).toBeTruthy()
  })

  it('still auto-loads the installed-cask security check unaffected by the pre-install path', async () => {
    getInfo.mockResolvedValue(fakePackage('thing', true, { installed: true }))
    inspectCaskSecurity.mockResolvedValue({
      appPath: '/Applications/Thing.app',
      signed: true,
      authority: 'Developer ID Application: Some Vendor (ABCDE12345)',
      teamId: 'ABCDE12345',
      gatekeeperOk: true,
      assessment: 'accepted',
      quarantined: false,
    } as SecurityInfo)
    render(<PackageDetailModal target={{ name: 'thing', isCask: true }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('packageDetail.tabSecurity'))

    await waitFor(() => expect(inspectCaskSecurity).toHaveBeenCalledWith('thing'))
    expect(await screen.findByText('packageDetail.gatekeeperPass')).toBeTruthy()
    expect(inspectCaskBeforeInstall).not.toHaveBeenCalled()
  })
})
