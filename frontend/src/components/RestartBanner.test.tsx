// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import RestartBanner from './RestartBanner'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe('RestartBanner', () => {
  it('shows the restart message and button', () => {
    render(<RestartBanner version="0.12.0" onRestart={() => {}} />)
    expect(screen.getByText('app.restartBanner.message')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'app.restartBanner.restartButton' })).toBeTruthy()
  })

  it('calls onRestart when the restart button is clicked', () => {
    const onRestart = vi.fn()
    render(<RestartBanner version="0.12.0" onRestart={onRestart} />)
    fireEvent.click(screen.getByRole('button', { name: 'app.restartBanner.restartButton' }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})
