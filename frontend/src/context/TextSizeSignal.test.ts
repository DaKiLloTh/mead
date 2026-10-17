// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseTextSize, scaleFor, startTextSize, textSizeSignal } from './TextSizeSignal'

describe('parseTextSize', () => {
  it('keeps a stored size that exists', () => {
    expect(parseTextSize('lg')).toBe('lg')
  })

  it('falls back to the default for a missing or unknown value', () => {
    expect(parseTextSize(null)).toBe('md')
    expect(parseTextSize('huge')).toBe('md')
  })
})

describe('startTextSize', () => {
  it('applies and saves the size now and on every change', () => {
    startTextSize()
    expect(document.documentElement.style.fontSize).toBe(scaleFor(textSizeSignal.value))

    textSizeSignal.value = 'xl'

    expect(document.documentElement.style.fontSize).toBe('20px')
    expect(localStorage.getItem('textSize')).toBe('xl')
  })
})
