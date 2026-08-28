import { describe, expect, it } from 'vitest'
import { isSudoTerminalRequiredFailure } from './uninstallElevation'

function lines(...texts: string[]) {
  return texts.map((text) => ({ text }))
}

describe('isSudoTerminalRequiredFailure', () => {
  it('matches the "a terminal is required" sudo diagnostic', () => {
    expect(
      isSudoTerminalRequiredFailure(
        lines(
          '==> Purging files for version 21.0.12,7 of Cask graalvm-jdk@21',
          'sudo: a terminal is required to read the password'
        )
      )
    ).toBe(true)
  })

  it('matches the "a password is required" sudo diagnostic', () => {
    expect(isSudoTerminalRequiredFailure(lines('sudo: a password is required'))).toBe(true)
  })

  it('matches when the pattern is embedded mid-line, not just a whole line', () => {
    expect(isSudoTerminalRequiredFailure(lines('Error: sudo: a password is required'))).toBe(true)
  })

  it('does not match an empty output', () => {
    expect(isSudoTerminalRequiredFailure([])).toBe(false)
  })

  it('does not match an unrelated uninstall failure', () => {
    expect(
      isSudoTerminalRequiredFailure(
        lines('Error: Refusing to uninstall wget because it is required by curl, which is currently installed.')
      )
    ).toBe(false)
  })

  it('does not match a generic permission-denied error that never mentions sudo', () => {
    expect(
      isSudoTerminalRequiredFailure(lines('rm: /Library/Java/JavaVirtualMachines/graalvm-21.jdk: Permission denied'))
    ).toBe(false)
  })

  it('does not match another sudo message that is not the terminal/password one', () => {
    expect(isSudoTerminalRequiredFailure(lines('sudo: unable to resolve host mead'))).toBe(false)
  })
})
