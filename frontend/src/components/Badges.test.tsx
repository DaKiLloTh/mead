// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/preact'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import SeverityBadge from './SeverityBadge'
import BundleEntryBadge from './BundleEntryBadge'
import PatchedBadge from './PatchedBadge'

afterEach(cleanup)

describe('SeverityBadge', () => {
  it.each([
    ['critical', 'badge-error', 'security.severityCritical'],
    ['high', 'badge-error', 'security.severityHigh'],
    ['medium', 'badge-warning', 'security.severityMedium'],
    ['low', 'badge-info', 'security.severityLow'],
    ['unknown', 'badge-neutral', 'security.severityUnknown'],
  ] as const)('%s uses %s', (severity, cls, label) => {
    const { container } = render(<SeverityBadge severity={severity} />)
    const el = container.querySelector('span')!
    expect(el.className).toContain(cls)
    expect(el.textContent).toBe(label)
  })

  it('renders critical solid, the rest outlined, and honors size', () => {
    const critical = render(<SeverityBadge severity="critical" />).container.querySelector('span')!
    expect(critical.className).not.toContain('badge-outline')
    const high = render(<SeverityBadge severity="high" size="xs" className="extra" />).container.querySelector('span')!
    expect(high.className).toContain('badge-outline')
    expect(high.className).toContain('badge-xs')
    expect(high.className).toContain('extra')
  })
})

describe('BundleEntryBadge', () => {
  it.each([
    ['formula', 'badge-primary', 'common.formula'],
    ['cask', 'badge-secondary', 'common.cask'],
    ['tap', 'badge-accent', 'common.entryTypeTap'],
    ['mas', 'badge-info', 'common.entryTypeMas'],
    ['vscode', 'badge-success', 'common.entryTypeVscode'],
    ['go', 'badge-warning', 'common.entryTypeGo'],
    ['cargo', 'badge-error', 'common.entryTypeCargo'],
    ['uv', 'badge-neutral', 'common.entryTypeUv'],
    ['flatpak', 'badge-primary', 'common.entryTypeFlatpak'],
    ['winget', 'badge-secondary', 'common.entryTypeWinget'],
    ['krew', 'badge-accent', 'common.entryTypeKrew'],
    ['npm', 'badge-info', 'common.entryTypeNpm'],
  ] as const)('%s', (type, cls, label) => {
    const el = render(<BundleEntryBadge type={type} />).container.querySelector('span')!
    expect(el.className).toContain(cls)
    expect(el.className).toContain('badge-outline')
    expect(el.textContent).toBe(label)
  })
})

describe('PatchedBadge', () => {
  it('renders the patched label with the requested size', () => {
    const el = render(<PatchedBadge size="xs" />).container.querySelector('span')!
    expect(el.className).toContain('badge-xs')
    expect(el.textContent).toContain('security.patchedBadge')
  })
})
