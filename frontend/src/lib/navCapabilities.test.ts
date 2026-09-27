import { describe, expect, it } from 'vitest'
import { isNavItemVisible, visibleNavItems } from './navCapabilities'
import type { Capabilities } from './api'

const macCaps: Capabilities = {
  hasGatekeeper: true,
  hasAppStore: true,
  hasTimeMachine: true,
  hasTouchID: true,
  hasAppAdoption: true,
  hasFloatingTitleBar: true,
}

const linuxCaps: Capabilities = {
  hasGatekeeper: false,
  hasAppStore: false,
  hasTimeMachine: false,
  hasTouchID: false,
  hasAppAdoption: false,
  hasFloatingTitleBar: false,
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
