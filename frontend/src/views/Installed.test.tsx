// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import type { BrewPackage } from '../lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${opts.count}` : opts && 'names' in opts ? `${key}:${opts.names}` : key,
  }),
}))

type Job = { status: string; lines: { text: string }[] }

const m = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
  refresh: vi.fn(),
  bump: vi.fn(),
  // What useInstalledPackages() returns.
  state: { packages: [] as unknown[] | null, loading: false, error: null as string | null },
  favorites: new Set<string>(),
  // The job runAction() resolves to is keyed by the package the last api call named.
  current: '',
  jobs: {} as Record<string, unknown>,
  runAction: vi.fn(),
  api: {
    leaves: vi.fn(),
    uninstall: vi.fn(),
    uninstallElevated: vi.fn(),
    upgrade: vi.fn(),
    pin: vi.fn(),
    unpin: vi.fn(),
  },
}))

vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ runAction: m.runAction, notify: m.notify }) }))
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => m.confirm }))
vi.mock('../context/UserDataContext', () => ({
  useUserData: () => ({ isFavorite: (name: string) => m.favorites.has(name) }),
}))
vi.mock('../context/InstalledPackagesSignal', () => ({
  useInstalledPackages: () => ({
    packages: m.state.packages,
    loading: m.state.loading,
    error: m.state.error,
    refresh: m.refresh,
  }),
}))
vi.mock('../lib/api', () => ({ api: m.api }))
vi.mock('../components/PackageIcon', () => ({ default: () => null }))
vi.mock('../components/PackageDetailModal', () => ({
  default: ({ target, onChanged }: { target: { name: string } | null; onClose: () => void; onChanged: () => void }) =>
    target ? (
      <div>
        <span>modal:{target.name}</span>
        <button onClick={onChanged}>modal-changed</button>
      </div>
    ) : null,
}))

import Installed from './Installed'

const ok: Job = { status: 'success', lines: [] }
const sudoFailure: Job = { status: 'error', lines: [{ text: 'sudo: a terminal is required to read the password' }] }

function pkg(name: string, over: Partial<BrewPackage> = {}): BrewPackage {
  return {
    name,
    fullName: name,
    isCask: false,
    desc: '',
    installedVersion: '1.0',
    version: '1.0',
    outdated: false,
    pinned: false,
    linked: true,
    deprecated: false,
    disabled: false,
    autoUpdates: false,
    ...over,
  } as BrewPackage
}

function show(...pkgs: BrewPackage[]) {
  m.state = { packages: pkgs, loading: false, error: null }
}

const renderInstalled = (props: Partial<Parameters<typeof Installed>[0]> = {}) =>
  render(<Installed refreshToken={0} bump={m.bump} {...props} />)
const row = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement
const tab = (label: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^installed\\.${label}`) }))
const names = () =>
  [...document.querySelectorAll('tbody tr td:nth-child(2) .font-medium span')].map((e) => e.textContent)
const check = (name: string) => fireEvent.click(within(row(name)).getAllByRole('checkbox')[0])

beforeEach(() => {
  vi.resetAllMocks()
  m.favorites = new Set()
  m.jobs = {}
  m.current = ''
  m.state = { packages: [], loading: false, error: null }
  m.runAction.mockImplementation(async (fn: () => Promise<string>) => {
    await fn()
    return m.jobs[m.current] ?? ok
  })
  m.confirm.mockResolvedValue({ ok: true, checked: [false] })
  m.api.leaves.mockResolvedValue([])
  const named = (suffix = '') =>
    vi.fn(async (name: string) => {
      m.current = name + suffix
      return 'job'
    })
  m.api.uninstall.mockImplementation(named())
  m.api.uninstallElevated.mockImplementation(named(':elevated'))
  m.api.upgrade.mockImplementation(named())
  m.api.pin.mockImplementation(named())
  m.api.unpin.mockImplementation(named())
})

afterEach(cleanup)

describe('Installed list', () => {
  const sample = () =>
    show(
      pkg('wget', { desc: 'Internet file retriever' }),
      pkg('iterm2', { isCask: true, fullName: 'homebrew/cask/iterm2', desc: 'Terminal emulator' }),
      pkg('llvm', { outdated: true, installedVersion: '20.1', version: '21.0' }),
      pkg('jq', { pinned: true }),
      pkg('rar', { isCask: true, deprecated: true }),
      pkg('flash', { isCask: true, disabled: true, autoUpdates: true }),
      pkg('ffmpeg', { linked: false })
    )

  it('lists every package with counts in the tabs', () => {
    sample()
    renderInstalled()
    expect(names()).toEqual(['wget', 'iterm2', 'llvm', 'jq', 'rar', 'flash', 'ffmpeg'])
    expect(screen.getByText('installed.subtitleCount:7')).toBeTruthy()
    for (const label of [
      'tabAll:7',
      'tabFormulae:4',
      'tabCasks:3',
      'tabOutdated:1',
      'tabFavorites:0',
      'tabDeprecated:1',
      'tabDisabled:1',
      'tabPinned:1',
    ]) {
      expect(screen.getByRole('tab', { name: `installed.${label}` })).toBeTruthy()
    }
  })

  it('filters by each tab', () => {
    sample()
    m.favorites = new Set(['wget'])
    renderInstalled()
    tab('tabFormulae')
    expect(names()).toEqual(['wget', 'llvm', 'jq', 'ffmpeg'])
    tab('tabCasks')
    expect(names()).toEqual(['iterm2', 'rar', 'flash'])
    tab('tabOutdated')
    expect(names()).toEqual(['llvm'])
    tab('tabFavorites')
    expect(names()).toEqual(['wget'])
    tab('tabDeprecated')
    expect(names()).toEqual(['rar'])
    tab('tabDisabled')
    expect(names()).toEqual(['flash'])
    tab('tabPinned')
    expect(names()).toEqual(['jq'])
    tab('tabAll')
    expect(names()).toHaveLength(7)
  })

  it('starts on the filter it is given', () => {
    sample()
    renderInstalled({ initialFilter: 'cask' })
    expect(names()).toEqual(['iterm2', 'rar', 'flash'])
  })

  it('searches the name, full name and description, ignoring case', () => {
    sample()
    renderInstalled()
    const box = screen.getByPlaceholderText('installed.filterPlaceholder')
    fireEvent.change(box, { target: { value: 'WGET' } })
    expect(names()).toEqual(['wget'])
    fireEvent.change(box, { target: { value: 'homebrew/cask' } })
    expect(names()).toEqual(['iterm2'])
    fireEvent.change(box, { target: { value: 'terminal' } })
    expect(names()).toEqual(['iterm2'])
    fireEvent.change(box, { target: { value: 'nothing matches this' } })
    expect(screen.getByText('installed.noMatches')).toBeTruthy()
  })

  it('shows status badges and marks favourites', () => {
    sample()
    m.favorites = new Set(['wget'])
    m.api.leaves.mockResolvedValue(['wget'])
    renderInstalled()
    expect(within(row('llvm')).getByText('common.badgeOutdated')).toBeTruthy()
    expect(within(row('jq')).getByText('common.badgePinned')).toBeTruthy()
    expect(within(row('ffmpeg')).getByText('common.badgeUnlinked')).toBeTruthy()
    expect(within(row('flash')).getByText('common.badgeAutoUpdates')).toBeTruthy()
    return waitFor(() => expect(within(row('wget')).getByText('installed.badgeLeaf')).toBeTruthy())
  })

  it('shows the installed version, falling back to the current one', () => {
    show(pkg('a', { installedVersion: '1.2', version: '9' }), pkg('b', { installedVersion: '', version: '3.4' }))
    renderInstalled()
    expect(within(row('a')).getByText('1.2')).toBeTruthy()
    expect(within(row('b')).getByText('3.4')).toBeTruthy()
  })

  it('shows a loading row, an error with retry, and reloads on retry', () => {
    m.state = { packages: null, loading: true, error: null }
    const { unmount } = renderInstalled()
    expect(screen.getByText('common.loading')).toBeTruthy()
    unmount()

    m.state = { packages: [], loading: false, error: 'brew failed' }
    renderInstalled()
    expect(screen.getByText('brew failed')).toBeTruthy()
    expect(screen.getByText('installed.subtitleError')).toBeTruthy()
    const leavesBefore = m.api.leaves.mock.calls.length
    fireEvent.click(screen.getByText('common.tryAgain'))
    expect(m.refresh).toHaveBeenCalledTimes(1)
    expect(m.api.leaves).toHaveBeenCalledTimes(leavesBefore + 1)
  })

  it('opens the detail modal from a name and refreshes when it reports a change', async () => {
    sample()
    renderInstalled()
    fireEvent.click(screen.getByText('wget'))
    expect(screen.getByText('modal:wget')).toBeTruthy()
    fireEvent.click(screen.getByText('modal-changed'))
    expect(m.bump).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(m.api.leaves).toHaveBeenCalledTimes(2))
  })
})

describe('Installed row actions', () => {
  it('upgrades an outdated package', async () => {
    show(pkg('llvm', { outdated: true }))
    renderInstalled()
    fireEvent.click(within(row('llvm')).getByTitle('installed.upgradeTooltip'))
    await waitFor(() => expect(m.api.upgrade).toHaveBeenCalledWith('llvm', false))
    await waitFor(() => expect(m.bump).toHaveBeenCalled())
  })

  it('offers no upgrade button for an up-to-date package', () => {
    show(pkg('wget'))
    renderInstalled()
    expect(within(row('wget')).queryByTitle('installed.upgradeTooltip')).toBeNull()
  })

  it('pins and unpins formulae, and offers no pin for a cask', async () => {
    show(pkg('wget'), pkg('jq', { pinned: true }), pkg('iterm2', { isCask: true }))
    renderInstalled()
    fireEvent.click(within(row('wget')).getByTitle('installed.pinTooltip'))
    await waitFor(() => expect(m.api.pin).toHaveBeenCalledWith('wget'))
    fireEvent.click(within(row('jq')).getByTitle('installed.unpinTooltip'))
    await waitFor(() => expect(m.api.unpin).toHaveBeenCalledWith('jq'))
    expect(within(row('iterm2')).queryByTitle('installed.pinTooltip')).toBeNull()
    await waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(2))
  })

  it('does not uninstall when the confirmation is declined', async () => {
    show(pkg('wget'))
    m.confirm.mockResolvedValue({ ok: false, checked: [] })
    renderInstalled()
    fireEvent.click(within(row('wget')).getByTitle('installed.uninstallTooltip'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.api.uninstall).not.toHaveBeenCalled()
  })

  it('offers app data removal for a cask, not for a formula', async () => {
    show(pkg('wget'), pkg('iterm2', { isCask: true }))
    renderInstalled()
    fireEvent.click(within(row('wget')).getByTitle('installed.uninstallTooltip'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.confirm.mock.calls[0][0].checkboxes).toEqual([])
    fireEvent.click(within(row('iterm2')).getByTitle('installed.uninstallTooltip'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(2))
    expect(m.confirm.mock.calls[1][0].checkboxes).toHaveLength(1)
  })

  it('uninstalls a cask with its app data when asked', async () => {
    show(pkg('iterm2', { isCask: true }))
    m.confirm.mockResolvedValue({ ok: true, checked: [true] })
    renderInstalled()
    fireEvent.click(within(row('iterm2')).getByTitle('installed.uninstallTooltip'))
    await waitFor(() => expect(m.api.uninstall).toHaveBeenCalledWith('iterm2', true, true, undefined))
    await waitFor(() => expect(m.bump).toHaveBeenCalled())
  })

  it('offers an administrator retry when the uninstall needs sudo, and retries on a yes', async () => {
    show(pkg('jdk', { isCask: true }))
    m.jobs = { jdk: sudoFailure }
    renderInstalled()
    fireEvent.click(within(row('jdk')).getByTitle('installed.uninstallTooltip'))
    await waitFor(() => expect(m.api.uninstallElevated).toHaveBeenCalledWith('jdk', true, false, undefined))
    expect(m.confirm).toHaveBeenCalledTimes(2)
    expect(m.confirm.mock.calls[1][0].title).toBe('installed.elevateUninstallTitle')
  })
})

describe('Installed selection and bulk actions', () => {
  it('selects rows and everything at once, and shows the bulk bar', () => {
    show(pkg('a'), pkg('b'))
    renderInstalled()
    expect(screen.queryByText('common.pin')).toBeNull()
    check('a')
    expect(screen.getByText('installed.selectedCount:1')).toBeTruthy()
    check('a')
    expect(screen.queryByText('installed.selectedCount:1')).toBeNull()
    fireEvent.click(document.querySelector('thead input[type=checkbox]') as HTMLInputElement)
    expect(screen.getByText('installed.selectedCount:2')).toBeTruthy()
    fireEvent.click(document.querySelector('thead input[type=checkbox]') as HTMLInputElement)
    expect(screen.queryByText('installed.selectedCount:2')).toBeNull()
  })

  it('upgrades only the outdated ones that are selected', async () => {
    show(pkg('a', { outdated: true }), pkg('b'), pkg('c', { outdated: true, isCask: true }))
    renderInstalled()
    check('a')
    check('b')
    check('c')
    fireEvent.click(screen.getByText('common.upgrade'))
    await waitFor(() => expect(m.api.upgrade).toHaveBeenCalledTimes(2))
    expect(m.api.upgrade).toHaveBeenCalledWith('a', false)
    expect(m.api.upgrade).toHaveBeenCalledWith('c', true)
    await waitFor(() => expect(screen.queryByText(/installed.selectedCount/)).toBeNull())
  })

  it('pins only the selected formulae that are not already pinned', async () => {
    show(pkg('a'), pkg('b', { pinned: true }), pkg('c', { isCask: true }))
    renderInstalled()
    check('a')
    check('b')
    check('c')
    fireEvent.click(screen.getByText('common.pin'))
    await waitFor(() => expect(m.api.pin).toHaveBeenCalledTimes(1))
    expect(m.api.pin).toHaveBeenCalledWith('a')
    await waitFor(() => expect(m.refresh).toHaveBeenCalled())
  })

  it('does not uninstall the selection when the confirmation is declined', async () => {
    show(pkg('a'), pkg('b'))
    m.confirm.mockResolvedValue({ ok: false, checked: [] })
    renderInstalled()
    check('a')
    fireEvent.click(screen.getByText('common.uninstall'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.confirm.mock.calls[0][0]).toEqual(expect.objectContaining({ danger: true, body: 'a' }))
    expect(m.api.uninstall).not.toHaveBeenCalled()
  })

  it('uninstalls the whole selection, with app data when a cask is included and asked for', async () => {
    show(pkg('wget'), pkg('iterm2', { isCask: true }))
    m.confirm.mockResolvedValue({ ok: true, checked: [true] })
    renderInstalled()
    check('wget')
    check('iterm2')
    fireEvent.click(screen.getByText('common.uninstall'))
    await waitFor(() => expect(m.api.uninstall).toHaveBeenCalledTimes(2))
    expect(m.confirm.mock.calls[0][0].checkboxes).toHaveLength(1)
    expect(m.api.uninstall).toHaveBeenCalledWith('wget', false, true, undefined)
    expect(m.api.uninstall).toHaveBeenCalledWith('iterm2', true, true, undefined)
    await waitFor(() => expect(m.bump).toHaveBeenCalled())
    expect(screen.queryByText(/installed.selectedCount/)).toBeNull()
    expect(m.confirm).toHaveBeenCalledTimes(1)
  })

  it('offers no app data checkbox when only formulae are selected', async () => {
    show(pkg('wget'))
    renderInstalled()
    check('wget')
    fireEvent.click(screen.getByText('common.uninstall'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.confirm.mock.calls[0][0].checkboxes).toEqual([])
  })

  it('asks once for every package that needs sudo, then retries just those', async () => {
    show(pkg('wget'), pkg('jdk-a', { isCask: true }), pkg('jdk-b', { isCask: true }))
    m.jobs = { 'jdk-a': sudoFailure, 'jdk-b': sudoFailure }
    renderInstalled()
    check('wget')
    check('jdk-a')
    check('jdk-b')
    fireEvent.click(screen.getByText('common.uninstall'))
    await waitFor(() => expect(m.api.uninstallElevated).toHaveBeenCalledTimes(2))
    // One confirmation for the bulk uninstall itself, one for the elevated retry of both.
    expect(m.confirm).toHaveBeenCalledTimes(2)
    expect(m.confirm.mock.calls[1][0]).toEqual({
      title: 'installed.elevateUninstallTitle',
      body: 'installed.elevateBulkUninstallBody:jdk-a, jdk-b',
      confirmLabel: 'installed.elevateUninstallConfirmLabel',
    })
    expect(m.api.uninstallElevated).toHaveBeenCalledWith('jdk-a', true, false, undefined)
    expect(m.api.uninstallElevated).toHaveBeenCalledWith('jdk-b', true, false, undefined)
    expect(m.api.uninstallElevated).not.toHaveBeenCalledWith('wget', false, false, undefined)
  })

  it('leaves the sudo failures alone when the retry is declined', async () => {
    show(pkg('jdk', { isCask: true }))
    m.jobs = { jdk: sudoFailure }
    m.confirm.mockResolvedValueOnce({ ok: true, checked: [false] }).mockResolvedValueOnce({ ok: false })
    renderInstalled()
    check('jdk')
    fireEvent.click(screen.getByText('common.uninstall'))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(m.bump).toHaveBeenCalled())
    expect(m.api.uninstallElevated).not.toHaveBeenCalled()
  })
})
