// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/preact'
import { useLazySignal } from './useLazySignal'

describe('useLazySignal', () => {
  it('runs the initializer once and keeps the same signal across renders', () => {
    const init = vi.fn(() => 'md')
    const { result, rerender } = renderHook(() => useLazySignal(init))
    const first = result.current
    expect(first.value).toBe('md')

    first.value = 'lg'
    rerender()

    expect(result.current).toBe(first)
    expect(result.current.value).toBe('lg')
    expect(init).toHaveBeenCalledTimes(1)
  })
})
