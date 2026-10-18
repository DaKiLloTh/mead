// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const menuBarStatus = vi.fn()
const setMenuBarEnabled = vi.fn()
vi.mock('../lib/api', () => ({
  api: {
    menuBarStatus: () => menuBarStatus(),
    setMenuBarEnabled: (on: boolean) => setMenuBarEnabled(on),
  },
}))

import MenuBarSetting from './MenuBarSetting'

beforeEach(() => {
  menuBarStatus.mockReset()
  setMenuBarEnabled.mockReset()
})
afterEach(cleanup)

function toggle() {
  return screen.getByRole('checkbox') as HTMLInputElement
}

describe('MenuBarSetting', () => {
  it('stays hidden when this build has no menu bar app', async () => {
    menuBarStatus.mockResolvedValue({ available: false, enabled: false })
    const { container } = render(<MenuBarSetting />)
    await waitFor(() => expect(menuBarStatus).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('stays hidden when the status call fails', async () => {
    menuBarStatus.mockRejectedValue(new Error('nope'))
    const { container } = render(<MenuBarSetting />)
    await waitFor(() => expect(menuBarStatus).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('shows the current state', async () => {
    menuBarStatus.mockResolvedValue({ available: true, enabled: true })
    render(<MenuBarSetting />)
    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(screen.getByText('settings.menuBarTitle')).toBeTruthy()
  })

  it('turns it on and reloads the state', async () => {
    menuBarStatus.mockResolvedValueOnce({ available: true, enabled: false })
    menuBarStatus.mockResolvedValueOnce({ available: true, enabled: true })
    setMenuBarEnabled.mockResolvedValue(undefined)
    render(<MenuBarSetting />)
    await waitFor(() => expect(toggle().checked).toBe(false))

    fireEvent.click(toggle())
    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(setMenuBarEnabled).toHaveBeenCalledWith(true)
  })

  it('shows an error when switching fails', async () => {
    menuBarStatus.mockResolvedValue({ available: true, enabled: false })
    setMenuBarEnabled.mockRejectedValue('launchctl said no')
    render(<MenuBarSetting />)
    await waitFor(() => expect(toggle()).toBeTruthy())

    fireEvent.click(toggle())
    await waitFor(() => expect(screen.getByText('settings.menuBarFailedTitle')).toBeTruthy())
    expect(toggle().checked).toBe(false)
  })
})
