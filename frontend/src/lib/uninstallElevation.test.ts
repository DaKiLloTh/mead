import { describe, expect, it, vi } from 'vitest'
import { isSudoTerminalRequiredFailure, uninstallWithElevationRetry } from './uninstallElevation'

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

describe('uninstallWithElevationRetry', () => {
  const prompt = { title: 'Retry?', body: 'needs admin', confirmLabel: 'Retry' }
  const target = { name: 'graalvm-jdk@21', isCask: true, zap: true, force: false }
  const sudoFailure = { status: 'error', lines: lines('sudo: a terminal is required to read the password') }

  function setup(jobs: { status: string; lines: { text: string }[] }[], confirmOk = true) {
    const queue = [...jobs]
    const calls: string[] = []
    const deps = {
      runAction: vi.fn(async (action: () => Promise<string>) => {
        await action()
        return queue.shift()!
      }),
      confirm: vi.fn(async () => ({ ok: confirmOk })),
      uninstall: vi.fn(async (...args: unknown[]) => {
        calls.push(`uninstall ${args.join(',')}`)
        return 'job-1'
      }),
      uninstallElevated: vi.fn(async (...args: unknown[]) => {
        calls.push(`elevated ${args.join(',')}`)
        return 'job-2'
      }),
    }
    return { deps, calls }
  }

  it('does not ask or retry when the uninstall succeeds', async () => {
    const { deps, calls } = setup([{ status: 'success', lines: [] }])
    expect(await uninstallWithElevationRetry(deps, target, prompt)).toBe(false)
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(calls).toEqual(['uninstall graalvm-jdk@21,true,true,false'])
  })

  it('does not offer elevation for an unrelated failure', async () => {
    const { deps } = setup([{ status: 'error', lines: lines('Error: package is in use') }])
    expect(await uninstallWithElevationRetry(deps, target, prompt)).toBe(false)
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(deps.uninstallElevated).not.toHaveBeenCalled()
  })

  it('offers elevation on the sudo failure and retries with the same flags on a yes', async () => {
    const { deps, calls } = setup([sudoFailure, { status: 'success', lines: [] }])
    expect(await uninstallWithElevationRetry(deps, target, prompt)).toBe(true)
    expect(deps.confirm).toHaveBeenCalledWith(prompt)
    expect(calls).toEqual(['uninstall graalvm-jdk@21,true,true,false', 'elevated graalvm-jdk@21,true,true,false'])
  })

  it('does not retry when the user declines', async () => {
    const { deps } = setup([sudoFailure], false)
    expect(await uninstallWithElevationRetry(deps, target, prompt)).toBe(false)
    expect(deps.confirm).toHaveBeenCalledTimes(1)
    expect(deps.uninstallElevated).not.toHaveBeenCalled()
  })

  it('passes force through as undefined when the caller omits it', async () => {
    const { deps, calls } = setup([{ status: 'success', lines: [] }])
    await uninstallWithElevationRetry(deps, { name: 'wget', isCask: false, zap: false }, prompt)
    expect(calls).toEqual(['uninstall wget,false,false,'])
  })
})
