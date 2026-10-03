import { describe, expect, it } from 'vitest'
import {
  isNavItemVisible,
  isPrimaryShortcutModifierPressed,
  primaryShortcutModifierLabel,
  visibleNavItems,
} from './navCapabilities'
import type { Capabilities } from './api'

const macCaps: Capabilities = {
  hasGatekeeper: true,
  hasAppStore: true,
  hasTimeMachine: true,
  hasTouchID: true,
  hasAppAdoption: true,
  hasFloatingTitleBar: true,
  hasCmdModifierKey: true,
}

const linuxCaps: Capabilities = {
  hasGatekeeper: false,
  hasAppStore: false,
  hasTimeMachine: false,
  hasTouchID: false,
  hasAppAdoption: false,
  hasFloatingTitleBar: false,
  hasCmdModifierKey: false,
}

describe('isNavItemVisible', () => {
  it('shows appstore when hasAppStore is true', () => {
    expect(isNavItemVisible('appstore', macCaps)).toBe(true)
  })

  it('hides appstore when hasAppStore is false', () => {
    expect(isNavItemVisible('appstore', linuxCaps)).toBe(false)
  })

  it('shows adopt when hasAppAdoption is true', () => {
    expect(isNavItemVisible('adopt', macCaps)).toBe(true)
  })

  it('hides adopt when hasAppAdoption is false', () => {
    expect(isNavItemVisible('adopt', linuxCaps)).toBe(false)
  })

  it('leaves an ungated item visible regardless of capabilities', () => {
    expect(isNavItemVisible('dashboard', linuxCaps)).toBe(true)
    expect(isNavItemVisible('security', linuxCaps)).toBe(true)
    expect(isNavItemVisible('settings', linuxCaps)).toBe(true)
  })
})

describe('visibleNavItems', () => {
  it('filters out only the capability-gated items on Linux', () => {
    const items = [
      { key: 'dashboard' as const },
      { key: 'appstore' as const },
      { key: 'adopt' as const },
      { key: 'security' as const },
    ]

    expect(visibleNavItems(items, linuxCaps)).toEqual([{ key: 'dashboard' }, { key: 'security' }])
  })

  it('keeps every item on macOS', () => {
    const items = [{ key: 'appstore' as const }, { key: 'adopt' as const }]

    expect(visibleNavItems(items, macCaps)).toEqual(items)
  })
})

describe('isPrimaryShortcutModifierPressed', () => {
  it('requires Cmd (metaKey) when the platform has a Cmd key', () => {
    expect(isPrimaryShortcutModifierPressed({ metaKey: true, ctrlKey: false }, macCaps)).toBe(true)
    expect(isPrimaryShortcutModifierPressed({ metaKey: false, ctrlKey: true }, macCaps)).toBe(false)
  })

  it('requires Ctrl when the platform has no Cmd key', () => {
    expect(isPrimaryShortcutModifierPressed({ metaKey: false, ctrlKey: true }, linuxCaps)).toBe(true)
    expect(isPrimaryShortcutModifierPressed({ metaKey: true, ctrlKey: false }, linuxCaps)).toBe(false)
  })

  it('both held is still a match for whichever one is required', () => {
    expect(isPrimaryShortcutModifierPressed({ metaKey: true, ctrlKey: true }, macCaps)).toBe(true)
    expect(isPrimaryShortcutModifierPressed({ metaKey: true, ctrlKey: true }, linuxCaps)).toBe(true)
  })
})

describe('primaryShortcutModifierLabel', () => {
  it('shows the Cmd glyph on a platform with a Cmd key', () => {
    expect(primaryShortcutModifierLabel(macCaps)).toBe('⌘')
  })

  it('shows Ctrl on a platform with no Cmd key', () => {
    expect(primaryShortcutModifierLabel(linuxCaps)).toBe('Ctrl')
  })
})
