// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/preact'
import { installedPackagesSignal } from '../context/InstalledPackagesSignal'
import { capabilitiesSignal } from '../context/CapabilitiesSignal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('./PackageDetailModal', () => ({ default: () => null }))

import CommandPalette from './CommandPalette'

const macCaps = {
  hasGatekeeper: true,
  hasAppStore: true,
  hasTimeMachine: true,
  hasTouchID: true,
  hasAppAdoption: true,
  hasFloatingTitleBar: true,
  hasCmdModifierKey: true,
}
const linuxCaps = {
  ...macCaps,
  hasAppStore: false,
  hasAppAdoption: false,
  hasFloatingTitleBar: false,
  hasCmdModifierKey: false,
}

beforeEach(() => {
  installedPackagesSignal.value = { packages: [], loading: false, error: null }
})
afterEach(cleanup)

describe('CommandPalette keyboard shortcut (issue #192)', () => {
  it('on a platform with a Cmd key, Cmd+K opens and toggles it, Ctrl+K does nothing', () => {
    capabilitiesSignal.value = { caps: macCaps, loading: false, error: null }
    const { container } = render(<CommandPalette onNavigate={vi.fn()} />)
    const isOpen = () => container.querySelector('dialog')!.className.includes('modal-open')
    expect(isOpen()).toBe(false)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(isOpen()).toBe(false)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(isOpen()).toBe(true)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(isOpen()).toBe(false)
  })

  it('on a platform with no Cmd key, Ctrl+K opens it and Cmd+K does nothing', () => {
    capabilitiesSignal.value = { caps: linuxCaps, loading: false, error: null }
    const { container } = render(<CommandPalette onNavigate={vi.fn()} />)
    const isOpen = () => container.querySelector('dialog')!.className.includes('modal-open')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(isOpen()).toBe(false)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(isOpen()).toBe(true)
  })

  it('shows the Cmd glyph in App.tsx-style hints only on a platform with a Cmd key', async () => {
    // The hint itself lives in App.tsx, not here; this covers the shared
    // helper it and CommandPalette both call, via its real export, so a
    // future change to one can't drift from the other undetected.
    const { primaryShortcutModifierLabel } = await import('../lib/navCapabilities')
    expect(primaryShortcutModifierLabel(macCaps)).toBe('⌘')
    expect(primaryShortcutModifierLabel(linuxCaps)).toBe('Ctrl')
  })
})
