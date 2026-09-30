// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.count !== undefined ? `${key}:${opts.count}` : key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))
vi.mock('../../wailsjs/runtime', () => ({ BrowserOpenURL: vi.fn() }))

const scanVulnerabilities = vi.fn()
vi.mock('../lib/api', () => ({
  api: {
    scanVulnerabilities: () => scanVulnerabilities(),
    findDuplicateApps: vi.fn(async () => [{ name: 'foo', formulaVersion: '1', caskVersion: '2' }]),
    missing: vi.fn(async () => ['libfoo']),
  },
}))

import Security from './Security'

const vuln = (id: string, severity: string, summary = '') => ({
  id,
  severity,
  summary,
  aliases: [],
  fixedVersions: [],
})

function result(over: Record<string, unknown>) {
  return { name: 'pkg', isCask: false, version: '1.0', open: [], patched: [], skipped: false, ...over }
}

beforeEach(() => scanVulnerabilities.mockReset())
afterEach(cleanup)

async function scan(results: unknown[]) {
  scanVulnerabilities.mockResolvedValue(results)
  const view = render(<Security />)
  fireEvent.click(view.getByText('security.scanFormulae'))
  await waitFor(() => expect(view.container.textContent).toContain('security.scanSummary'))
  return view
}

describe('Security vulnerabilities tab', () => {
  it('shows the all-clear when nothing is open or patched', async () => {
    const view = await scan([result({ name: 'jq' })])
    expect(view.getByText('security.noVulnerabilities')).toBeTruthy()
  })

  it('renders an open advisory with its severity badge and osv.dev link', async () => {
    const view = await scan([result({ name: 'libheif', open: [vuln('OSV-2020-2308', 'medium', 'Heap overflow')] })])
    expect(view.getByText('security.severityMedium')).toBeTruthy()
    const link = view.container.querySelector('a[href="https://osv.dev/vulnerability/OSV-2020-2308"]')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('title')).toBe('Heap overflow')
    expect(view.container.textContent).not.toContain('security.patchedOnlyHeading')
  })

  it('shows a patched count next to a package that has both open and patched advisories', async () => {
    const view = await scan([
      result({ name: 'augeas', open: [vuln('OSV-2020-1540', 'high')], patched: [vuln('CVE-2025-2588', 'unknown')] }),
    ])
    expect(view.getByText('security.patchedCount:1')).toBeTruthy()
    expect(view.getByText('security.severityHigh')).toBeTruthy()
  })

  it('lists patched-only packages separately and does not count them as affected', async () => {
    const view = await scan([result({ name: 'augeas', patched: [vuln('CVE-2025-2588', 'unknown', '')] })])
    expect(view.getByText('security.patchedOnlyHeading:1')).toBeTruthy()
    expect(view.container.textContent).toContain('CVE-2025-2588')
    expect(view.container.textContent).toContain('security.scanSummaryPatchedSuffix:1')
    expect(view.container.textContent).not.toContain('security.noVulnerabilities')
    const link = view.container.querySelector('a[href="https://osv.dev/vulnerability/CVE-2025-2588"]')
    expect(link?.getAttribute('title')).toBe('CVE-2025-2588')
  })

  it('mentions packages that could not be checked in the summary', async () => {
    const view = await scan([result({ name: 'x', error: 'boom' })])
    expect(view.container.textContent).toContain('security.scanSummaryErroredSuffix:1')
  })
})

describe('Security other tabs', () => {
  it('lists duplicate installs', async () => {
    const view = render(<Security />)
    fireEvent.click(view.getByText('security.tabDuplicates'))
    fireEvent.click(view.getByText('security.scanDuplicates'))
    await waitFor(() => view.getByText('foo'))
  })

  it('lists missing dependencies', async () => {
    const view = render(<Security />)
    fireEvent.click(view.getByText('security.tabMissingDeps'))
    fireEvent.click(view.getByText('security.checkMissing'))
    await waitFor(() => expect(view.container.textContent).toContain('libfoo'))
  })
})
