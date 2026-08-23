import { describe, expect, it } from 'vitest'
import { monogramFor } from './monogram'

describe('monogramFor', () => {
  it('is deterministic for the same name', () => {
    expect(monogramFor('firefox')).toEqual(monogramFor('firefox'))
    expect(monogramFor('google-chrome')).toEqual(monogramFor('google-chrome'))
  })

  it('uppercases the first letter of the name', () => {
    expect(monogramFor('firefox').letter).toBe('F')
    expect(monogramFor('Visual Studio Code').letter).toBe('V')
  })

  it('is case-insensitive for color assignment (same color regardless of case)', () => {
    expect(monogramFor('Firefox').bg).toBe(monogramFor('firefox').bg)
    expect(monogramFor('FIREFOX').bg).toBe(monogramFor('firefox').bg)
  })

  it('produces more than one distinct color across a handful of different names', () => {
    const names = ['firefox', 'wget', 'git', 'docker', 'node', 'python', 'rust', 'go', 'zsh', 'htop']
    const colors = new Set(names.map((n) => monogramFor(n).bg))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('always returns a bg/fg pair from the fixed palette', () => {
    const { bg, fg } = monogramFor('some-random-package-name')
    expect(bg).toMatch(/^#[0-9a-f]{6}$/)
    expect(fg).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('falls back to a placeholder letter for an empty or whitespace-only name', () => {
    expect(monogramFor('').letter).toBe('?')
    expect(monogramFor('   ').letter).toBe('?')
  })
})
