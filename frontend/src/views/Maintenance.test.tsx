// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${opts.count}` : opts && 'path' in opts ? `${key}:${opts.path}` : key,
  }),
}))

const m = vi.hoisted(() => ({
  runAction: vi.fn(),
  notify: vi.fn(),
  confirm: vi.fn(),
  // What the next runAction() resolves to.
  job: { lines: [] as { text: string }[] },
  api: {
    cacheInfo: vi.fn(),
    largestInstalledPackages: vi.fn(),
    scanLeftovers: vi.fn(),
    deleteLeftovers: vi.fn(),
    doctor: vi.fn(),
    cleanup: vi.fn(),
    autoremove: vi.fn(),
    clearCache: vi.fn(),
    config: vi.fn(),
    exportBrewfileToFile: vi.fn(),
    importBrewfile: vi.fn(),
    pickBrewfile: vi.fn(),
    bundleCheck: vi.fn(),
    bundleList: vi.fn(),
    bundleCleanupPreview: vi.fn(),
    bundleCleanup: vi.fn(),
    createSnapshot: vi.fn(),
  },
}))
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ runAction: m.runAction, notify: m.notify }) }))
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => m.confirm }))
vi.mock('../lib/api', () => ({ api: m.api }))

import Maintenance from './Maintenance'

// A promise the test resolves by hand, so the view stays in its loading state.
function pending<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const lines = (...texts: string[]) => texts.map((text) => ({ text }))
const button = (text: string) => screen.getByText(text).closest('button') as HTMLButtonElement
const click = (text: string) => fireEvent.click(button(text))
const openTab = (name: string) => fireEvent.click(screen.getByText(`maintenance.tab${name}`, { exact: false }))
const spinners = (root: Element) => root.querySelectorAll('.loading-spinner').length

const leftoverItems = [
  { name: 'Foo', path: '/L/Foo', kind: 'caches', sizeHuman: '2 MB' },
  { name: 'Bar', path: '/L/Bar', kind: 'somethingNew', sizeHuman: '1 MB' },
]

beforeEach(() => {
  vi.resetAllMocks()
  m.job = { lines: [] }
  m.runAction.mockImplementation(async (fn: () => Promise<string>) => {
    await fn()
    return m.job
  })
  m.confirm.mockResolvedValue({ ok: true, checked: [] })
  m.api.cacheInfo.mockResolvedValue({ path: '/cache', sizeHuman: '1 GB' })
  m.api.largestInstalledPackages.mockResolvedValue([])
  m.api.scanLeftovers.mockResolvedValue(leftoverItems)
  m.api.deleteLeftovers.mockResolvedValue(undefined)
  m.api.config.mockResolvedValue('HOMEBREW_PREFIX: /opt/homebrew')
  m.api.createSnapshot.mockResolvedValue('snap')
})

afterEach(cleanup)

describe('Maintenance loading state', () => {
  it('shows a single spinner while the largest packages load', async () => {
    const largest = pending<never[]>()
    m.api.largestInstalledPackages.mockReturnValue(largest.promise)
    const { container } = render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('common.refresh')).toBeTruthy())
    // The Refresh button already shows the loading state and is disabled.
    expect(button('common.refresh').disabled).toBe(true)
    expect(spinners(container)).toBe(1)
    largest.resolve([])
    await waitFor(() => expect(spinners(container)).toBe(0))
  })

  it('shows a single spinner while leftovers are scanned', async () => {
    const scan = pending<never[]>()
    m.api.scanLeftovers.mockReturnValue(scan.promise)
    const { container } = render(<Maintenance />)
    openTab('Leftovers')
    const scanButton = button('maintenance.scanLeftovers')
    fireEvent.click(scanButton)
    await waitFor(() => expect(scanButton.disabled).toBe(true))
    expect(spinners(container)).toBe(1)
    scan.resolve([])
    await waitFor(() => expect(scanButton.disabled).toBe(false))
    expect(spinners(container)).toBe(0)
  })
})

describe('Maintenance doctor tab', () => {
  it('runs brew doctor and shows its output', async () => {
    m.job = { lines: lines('Warning: something', 'Warning: else') }
    render(<Maintenance />)
    click('maintenance.runDoctor')
    await waitFor(() => expect(screen.getByText(/Warning: something/)).toBeTruthy())
    expect(m.api.doctor).toHaveBeenCalledTimes(1)
  })

  it('says all is well when doctor prints nothing', async () => {
    render(<Maintenance />)
    click('maintenance.runDoctor')
    await waitFor(() => expect(screen.getByText('maintenance.doctorAllGood')).toBeTruthy())
  })
})

describe('Maintenance cleanup tab', () => {
  it('shows the download cache size and location', async () => {
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('1 GB')).toBeTruthy())
    expect(screen.getByText('/cache')).toBeTruthy()
  })

  it('previews a cleanup as a dry run and refreshes the cache size', async () => {
    m.job = { lines: lines('Would remove: /x') }
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(m.api.cacheInfo).toHaveBeenCalledTimes(1))
    click('maintenance.previewDryRun')
    await waitFor(() => expect(screen.getByText(/Would remove: \/x/)).toBeTruthy())
    expect(m.api.cleanup).toHaveBeenCalledWith(true)
    expect(m.api.cacheInfo).toHaveBeenCalledTimes(2)
  })

  it('runs the real cleanup', async () => {
    render(<Maintenance />)
    openTab('Cleanup')
    click('maintenance.cleanUpNow')
    await waitFor(() => expect(screen.getByText('maintenance.nothingToCleanUp')).toBeTruthy())
    expect(m.api.cleanup).toHaveBeenCalledWith(false)
  })

  it('clears the download cache and refreshes its size', async () => {
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('maintenance.clearCacheButton')).toBeTruthy())
    click('maintenance.clearCacheButton')
    await waitFor(() => expect(m.api.clearCache).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(m.api.cacheInfo).toHaveBeenCalledTimes(2))
  })

  it('previews and runs autoremove', async () => {
    m.job = { lines: lines('Would autoremove libfoo') }
    render(<Maintenance />)
    openTab('Cleanup')
    click('maintenance.previewOrphans')
    await waitFor(() => expect(screen.getByText(/Would autoremove libfoo/)).toBeTruthy())
    expect(m.api.autoremove).toHaveBeenLastCalledWith(true)
    click('maintenance.removeOrphanedDeps')
    await waitFor(() => expect(m.api.autoremove).toHaveBeenLastCalledWith(false))
  })

  it('lists the largest packages', async () => {
    m.api.largestInstalledPackages.mockResolvedValue([
      { name: 'llvm', isCask: false, sizeHuman: '2 GB' },
      { name: 'docker', isCask: true, sizeHuman: '1 GB' },
    ])
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('llvm')).toBeTruthy())
    expect(screen.getByText('docker')).toBeTruthy()
    expect(screen.getByText('2 GB')).toBeTruthy()
  })

  it('says so when nothing is installed', async () => {
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('maintenance.noInstalledPackages')).toBeTruthy())
  })

  it('keeps the previous largest list when a refresh fails', async () => {
    m.api.largestInstalledPackages.mockResolvedValueOnce([{ name: 'llvm', isCask: false, sizeHuman: '2 GB' }])
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(screen.getByText('llvm')).toBeTruthy())
    m.api.largestInstalledPackages.mockRejectedValueOnce(new Error('boom'))
    click('common.refresh')
    await waitFor(() => expect(m.api.largestInstalledPackages).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(button('common.refresh').disabled).toBe(false))
    expect(screen.getByText('llvm')).toBeTruthy()
  })

  it('shows no cache panel when cache info is unavailable', async () => {
    m.api.cacheInfo.mockRejectedValue(new Error('no cache'))
    render(<Maintenance />)
    openTab('Cleanup')
    await waitFor(() => expect(m.api.largestInstalledPackages).toHaveBeenCalled())
    expect(screen.queryByText('maintenance.clearCacheButton')).toBeNull()
  })
})

describe('Maintenance leftovers tab', () => {
  async function scanned() {
    render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('Foo')).toBeTruthy())
  }

  it('lists what the scan found, with a label per kind and the raw kind for an unknown one', async () => {
    await scanned()
    expect(screen.getByText('/L/Foo')).toBeTruthy()
    expect(screen.getByText('maintenance.kindCaches')).toBeTruthy()
    expect(screen.getByText('somethingNew')).toBeTruthy()
  })

  it('says so when there are no leftovers', async () => {
    m.api.scanLeftovers.mockResolvedValue([])
    render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('maintenance.noLeftoversFound')).toBeTruthy())
  })

  it('reports a failed scan as a toast', async () => {
    m.api.scanLeftovers.mockRejectedValue(new Error('scan failed'))
    render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(m.notify).toHaveBeenCalledWith('error', 'Error: scan failed'))
  })

  it('selects and deselects rows and everything at once', async () => {
    const { container } = render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('Foo')).toBeTruthy())
    const boxes = () => [...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
    expect(button('maintenance.removeSelectedButton:0').disabled).toBe(true)

    fireEvent.click(boxes()[0])
    expect(boxes()[0].checked).toBe(true)
    expect(screen.getByText('maintenance.selectedSummary:1')).toBeTruthy()
    fireEvent.click(boxes()[0])
    expect(boxes()[0].checked).toBe(false)

    click('maintenance.selectAll')
    expect(boxes().every((b) => b.checked)).toBe(true)
    click('maintenance.selectNone')
    expect(boxes().every((b) => !b.checked)).toBe(true)
  })

  it('does nothing when the delete confirmation is declined', async () => {
    const { container } = render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('Foo')).toBeTruthy())
    fireEvent.click(container.querySelector('input[type=checkbox]') as HTMLInputElement)
    m.confirm.mockResolvedValue({ ok: false, checked: [] })
    click('maintenance.removeSelectedButton:1')
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.api.deleteLeftovers).not.toHaveBeenCalled()
  })

  it('deletes the selected paths after confirming, then scans again', async () => {
    const { container } = render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('Foo')).toBeTruthy())
    fireEvent.click(container.querySelector('input[type=checkbox]') as HTMLInputElement)
    click('maintenance.removeSelectedButton:1')
    await waitFor(() => expect(m.api.deleteLeftovers).toHaveBeenCalledWith(['/L/Foo']))
    expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }))
    expect(m.notify).toHaveBeenCalledWith('success', 'maintenance.leftoversDeleted:1')
    await waitFor(() => expect(m.api.scanLeftovers).toHaveBeenCalledTimes(2))
  })

  it('reports a failed delete as a toast and does not rescan', async () => {
    m.api.deleteLeftovers.mockRejectedValue(new Error('denied'))
    const { container } = render(<Maintenance />)
    openTab('Leftovers')
    click('maintenance.scanLeftovers')
    await waitFor(() => expect(screen.getByText('Foo')).toBeTruthy())
    fireEvent.click(container.querySelector('input[type=checkbox]') as HTMLInputElement)
    click('maintenance.removeSelectedButton:1')
    await waitFor(() => expect(m.notify).toHaveBeenCalledWith('error', 'Error: denied'))
    expect(m.api.scanLeftovers).toHaveBeenCalledTimes(1)
  })
})

describe('Maintenance Brewfile tab', () => {
  it('exports a Brewfile and shows where it was saved', async () => {
    m.api.exportBrewfileToFile.mockResolvedValue('/Users/me/Brewfile')
    render(<Maintenance />)
    openTab('Brewfile')
    click('maintenance.exportButton')
    await waitFor(() => expect(screen.getByText('maintenance.savedTo:/Users/me/Brewfile')).toBeTruthy())
  })

  it('shows nothing when the export dialog is cancelled', async () => {
    m.api.exportBrewfileToFile.mockResolvedValue('')
    render(<Maintenance />)
    openTab('Brewfile')
    click('maintenance.exportButton')
    await waitFor(() => expect(m.api.exportBrewfileToFile).toHaveBeenCalled())
    await waitFor(() => expect(button('maintenance.exportButton').disabled).toBe(false))
    expect(screen.queryByText(/maintenance.savedTo/)).toBeNull()
  })

  it('imports a Brewfile as a job', async () => {
    render(<Maintenance />)
    openTab('Brewfile')
    click('maintenance.importButton')
    await waitFor(() => expect(m.api.importBrewfile).toHaveBeenCalledTimes(1))
  })

  it('offers the Brewfile checks only once a file is chosen', async () => {
    render(<Maintenance />)
    openTab('Brewfile')
    expect(screen.queryByText('maintenance.check')).toBeNull()
    m.api.pickBrewfile.mockResolvedValueOnce('')
    click('maintenance.selectBrewfile')
    await waitFor(() => expect(m.api.pickBrewfile).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('maintenance.check')).toBeNull()

    m.api.pickBrewfile.mockResolvedValueOnce('/tmp/Brewfile')
    click('maintenance.selectBrewfile')
    await waitFor(() => expect(screen.getByText('/tmp/Brewfile')).toBeTruthy())
    expect(screen.getByText('maintenance.changeBrewfile')).toBeTruthy()
    expect(screen.getByText('maintenance.check')).toBeTruthy()
  })

  async function withBrewfile() {
    m.api.pickBrewfile.mockResolvedValue('/tmp/Brewfile')
    const view = render(<Maintenance />)
    openTab('Brewfile')
    click('maintenance.selectBrewfile')
    await waitFor(() => expect(screen.getByText('maintenance.check')).toBeTruthy())
    return view
  }

  it('shows a satisfied check as a success and an unsatisfied one as a warning', async () => {
    const { container } = await withBrewfile()
    m.api.bundleCheck.mockResolvedValueOnce("The Brewfile's dependencies are satisfied.")
    click('maintenance.check')
    await waitFor(() => expect(screen.getByText(/are satisfied/)).toBeTruthy())
    expect(m.api.bundleCheck).toHaveBeenCalledWith('/tmp/Brewfile')
    expect(container.querySelector('.alert-success')).not.toBeNull()

    m.api.bundleCheck.mockResolvedValueOnce('jq needs to be installed')
    click('maintenance.check')
    await waitFor(() => expect(screen.getByText('jq needs to be installed')).toBeTruthy())
    expect(container.querySelector('.alert-warning')).not.toBeNull()
  })

  it('shows a failed check as its error text', async () => {
    await withBrewfile()
    m.api.bundleCheck.mockRejectedValueOnce(new Error('bad file'))
    click('maintenance.check')
    await waitFor(() => expect(screen.getByText('Error: bad file')).toBeTruthy())
  })

  it('lists the Brewfile contents, or its error', async () => {
    await withBrewfile()
    m.api.bundleList.mockResolvedValueOnce('brew "jq"')
    click('maintenance.listContents')
    await waitFor(() => expect(screen.getByText('brew "jq"')).toBeTruthy())
    expect(m.api.bundleList).toHaveBeenCalledWith('/tmp/Brewfile')

    m.api.bundleList.mockRejectedValueOnce(new Error('unreadable'))
    click('maintenance.listContents')
    await waitFor(() => expect(screen.getByText('Error: unreadable')).toBeTruthy())
  })

  it('says so when a cleanup preview would remove nothing', async () => {
    await withBrewfile()
    m.api.bundleCleanupPreview.mockResolvedValue([])
    click('maintenance.previewCleanup')
    await waitFor(() => expect(screen.getByText('maintenance.cleanupNothingToRemove')).toBeTruthy())
    expect(screen.queryByText(/maintenance.removePackagesButton/)).toBeNull()
  })

  const previewItems = [
    { name: 'jq', isCask: false },
    { name: 'iterm2', isCask: true },
  ]

  async function withPreview() {
    await withBrewfile()
    m.api.bundleCleanupPreview.mockResolvedValue(previewItems)
    click('maintenance.previewCleanup')
    await waitFor(() => expect(screen.getByText('jq')).toBeTruthy())
    expect(screen.getByText('iterm2')).toBeTruthy()
  }

  it('does not remove anything when the confirmation is declined', async () => {
    await withPreview()
    m.confirm.mockResolvedValue({ ok: false, checked: [false] })
    click('maintenance.removePackagesButton:2')
    await waitFor(() => expect(m.confirm).toHaveBeenCalledTimes(1))
    expect(m.api.bundleCleanup).not.toHaveBeenCalled()
    expect(m.api.createSnapshot).not.toHaveBeenCalled()
  })

  it('removes the previewed packages after confirming, with no snapshot unless asked', async () => {
    await withPreview()
    m.confirm.mockResolvedValue({ ok: true, checked: [false] })
    click('maintenance.removePackagesButton:2')
    await waitFor(() => expect(m.api.bundleCleanup).toHaveBeenCalledWith('/tmp/Brewfile'))
    expect(m.api.createSnapshot).not.toHaveBeenCalled()
    // The preview is cleared once the cleanup has run.
    await waitFor(() => expect(screen.queryByText('jq')).toBeNull())
  })

  it('takes a snapshot first when asked, and says so', async () => {
    await withPreview()
    m.confirm.mockResolvedValue({ ok: true, checked: [true] })
    click('maintenance.removePackagesButton:2')
    await waitFor(() => expect(m.api.bundleCleanup).toHaveBeenCalled())
    expect(m.api.createSnapshot).toHaveBeenCalledTimes(1)
    expect(m.notify).toHaveBeenCalledWith('success', 'maintenance.localSnapshotCreated')
  })

  it('still cleans up when the snapshot fails, and reports the failure', async () => {
    await withPreview()
    m.api.createSnapshot.mockRejectedValue(new Error('no snapshot'))
    m.confirm.mockResolvedValue({ ok: true, checked: [true] })
    click('maintenance.removePackagesButton:2')
    await waitFor(() => expect(m.notify).toHaveBeenCalledWith('error', 'Error: no snapshot'))
    await waitFor(() => expect(m.api.bundleCleanup).toHaveBeenCalled())
  })

  it('forgets the previous results when a different Brewfile is chosen', async () => {
    await withPreview()
    m.api.pickBrewfile.mockResolvedValue('/tmp/Other')
    click('maintenance.changeBrewfile')
    await waitFor(() => expect(screen.getByText('/tmp/Other')).toBeTruthy())
    expect(screen.queryByText('jq')).toBeNull()
  })
})

describe('Maintenance config tab', () => {
  it('loads the Homebrew config the first time the tab opens, and only then', async () => {
    render(<Maintenance />)
    openTab('Config')
    await waitFor(() => expect(screen.getByText('HOMEBREW_PREFIX: /opt/homebrew')).toBeTruthy())
    openTab('Doctor')
    openTab('Config')
    expect(screen.getByText('HOMEBREW_PREFIX: /opt/homebrew')).toBeTruthy()
    expect(m.api.config).toHaveBeenCalledTimes(1)
  })
})
