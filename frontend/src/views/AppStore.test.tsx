// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/preact'
import { appStoreSignal } from '../context/AppStoreSignal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}))
vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ runAction: vi.fn(), notify: vi.fn() }) }))
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))
vi.mock('../components/PackageIcon', () => ({ default: () => null }))
vi.mock('../../wailsjs/runtime', () => ({ BrowserOpenURL: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: {
    touchIDSudoStatus: vi.fn(async () => ({ available: false, enabled: false })),
    masAvailable: vi.fn(async () => true),
    masList: vi.fn(async () => []),
    masOutdated: vi.fn(async () => []),
  },
}))
vi.mock('../context/AppStoreSignal', async () => {
  const { signal } = await import('@preact/signals')
  return {
    appStoreSignal: signal({}),
    ensureAppStoreLoaded: vi.fn(),
    loadAppStore: vi.fn(),
  }
})

import AppStore from './AppStore'

afterEach(cleanup)

function setState(apps: { id: string; name: string; installedVersion: string }[]) {
  appStoreSignal.value = { available: true, apps, outdated: [], loading: false, error: null } as never
}

describe('AppStore', () => {
  it('links each app row to its page in the App Store', () => {
    setState([
      { id: '409201541', name: 'Pages', installedVersion: '14.5' },
      { id: '409183694', name: 'Keynote', installedVersion: '14.5' },
    ])
    const { container } = render(<AppStore />)
    const hrefs = [...container.querySelectorAll('a[title="appstore.openInAppStore"]')].map((a) =>
      a.getAttribute('href')
    )
    expect(hrefs).toEqual([
      'macappstore://apps.apple.com/app/id409201541',
      'macappstore://apps.apple.com/app/id409183694',
    ])
  })

  it('shows no link for an app whose id is not numeric', () => {
    setState([{ id: 'oops', name: 'Odd', installedVersion: '1' }])
    const { container } = render(<AppStore />)
    expect(container.querySelector('a[title="appstore.openInAppStore"]')).toBeNull()
  })
})
