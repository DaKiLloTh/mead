// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import ErrorAlert from './ErrorAlert'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe('ErrorAlert', () => {
  it('shows the title and the message', () => {
    render(<ErrorAlert title="Couldn't load" message="brew list failed" />)
    expect(screen.getByText("Couldn't load")).toBeTruthy()
    expect(screen.getByText('brew list failed')).toBeTruthy()
  })

  it('has no retry button without onRetry', () => {
    render(<ErrorAlert title="t" message="m" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a retry button that calls onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorAlert title="t" message="m" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /common\.tryAgain/ }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('appends className without leaving a trailing space when there is none', () => {
    const { container, rerender } = render(<ErrorAlert title="t" message="m" />)
    expect((container.firstElementChild as HTMLElement).className).toBe('alert alert-error alert-soft')
    rerender(<ErrorAlert title="t" message="m" className="mb-4" />)
    expect((container.firstElementChild as HTMLElement).className).toBe('alert alert-error alert-soft mb-4')
  })
})
