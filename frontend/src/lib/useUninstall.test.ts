// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/preact'

const { runAction, confirm, uninstall, uninstallElevated } = vi.hoisted(() => ({
  runAction: vi.fn(),
  confirm: vi.fn(),
  uninstall: vi.fn(async () => 'job-1'),
  uninstallElevated: vi.fn(async () => 'job-2'),
}))

vi.mock('../context/JobsContext', () => ({ useJobs: () => ({ runAction }) }))
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => confirm }))
vi.mock('./api', () => ({ api: { uninstall, uninstallElevated } }))

import { useUninstall, useUninstallMany } from './useUninstall'

describe('useUninstall', () => {
  it('runs the uninstall through the job runner with the given flags', async () => {
    runAction.mockImplementation(async (fn: () => Promise<string>) => {
      await fn()
      return { status: 'success', lines: [] }
    })
    const { result } = renderHook(() => useUninstall())
    const prompt = { title: 't', body: 'b', confirmLabel: 'c' }
    await result.current({ name: 'wget', isCask: false, zap: false, force: true }, prompt)
    expect(uninstall).toHaveBeenCalledWith('wget', false, false, true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('offers the elevated retry through the app confirm dialog', async () => {
    const jobs = [
      { status: 'error', lines: [{ text: 'sudo: a password is required' }] },
      { status: 'success', lines: [] },
    ]
    runAction.mockImplementation(async (fn: () => Promise<string>) => {
      await fn()
      return jobs.shift()
    })
    confirm.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useUninstall())
    const prompt = { title: 't', body: 'b', confirmLabel: 'c' }
    await result.current({ name: 'jdk', isCask: true, zap: true }, prompt)
    expect(confirm).toHaveBeenCalledWith(prompt)
    expect(uninstallElevated).toHaveBeenCalledWith('jdk', true, true, undefined)
  })
})

describe('useUninstallMany', () => {
  it('asks once and retries the sudo failures through the app confirm dialog', async () => {
    const jobs = [
      { status: 'success', lines: [] },
      { status: 'error', lines: [{ text: 'sudo: a password is required' }] },
      { status: 'success', lines: [] },
    ]
    runAction.mockImplementation(async (fn: () => Promise<string>) => {
      await fn()
      return jobs.shift()
    })
    confirm.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useUninstallMany())
    const promptFor = (names: string[]) => ({ title: 't', body: names.join(','), confirmLabel: 'c' })
    const out = await result.current(
      [
        { name: 'wget', isCask: false, zap: false },
        { name: 'jdk', isCask: true, zap: true },
      ],
      promptFor
    )
    expect(out.retried).toEqual(['jdk'])
    expect(confirm).toHaveBeenCalledWith(promptFor(['jdk']))
    expect(uninstall).toHaveBeenCalledWith('wget', false, false, undefined)
    expect(uninstallElevated).toHaveBeenCalledWith('jdk', true, true, undefined)
  })
})
