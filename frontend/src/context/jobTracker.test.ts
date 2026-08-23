import { describe, expect, it } from 'vitest'
import { JobTracker, type JobState } from './jobTracker'

function makeTracker() {
  const notifications: Array<{ type: string; message: string }> = []
  const jobsSnapshots: JobState[][] = []
  const tracker = new JobTracker({
    onJobsChange: (jobs) => jobsSnapshots.push(jobs),
    onNotify: (type, message) => notifications.push({ type, message }),
  })
  return { tracker, notifications, jobsSnapshots }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

describe('JobTracker.runAction', () => {
  it('resolves when job:start and job:done fire synchronously, before the RPC promise resolves (the race)', async () => {
    const { tracker } = makeTracker()

    // Simulates a Go-side App method (e.g. ImportBrewfile when the user
    // cancels the native file picker, or a fast validateName() failure on
    // tap-add) that calls jobs.Fail()/jobs.Done() synchronously, so the
    // job:start + job:done Wails events are dispatched *before* the bound
    // RPC function's own promise resolves in JS.
    async function raceyAction(): Promise<string> {
      const id = 'job-1'
      tracker.handleStart({ id, title: 'Import Brewfile' })
      tracker.handleDone({ id, success: false, exitCode: 1, error: 'cancelled' })
      return id
    }

    const result = await withTimeout(tracker.runAction(raceyAction), 200)

    expect(result.status).toBe('error')
    expect(result.error).toBe('cancelled')
  })

  it('still resolves normally when job:done fires after the RPC promise has resolved', async () => {
    const { tracker } = makeTracker()

    async function normalAction(): Promise<string> {
      return 'job-2'
    }

    const promise = tracker.runAction(normalAction)
    // Let the RPC "call" resolve and runAction register its resolver first.
    await Promise.resolve()
    await Promise.resolve()

    tracker.handleStart({ id: 'job-2', title: 'Update' })
    tracker.handleDone({ id: 'job-2', success: true, exitCode: 0 })

    const result = await withTimeout(promise, 200)
    expect(result.status).toBe('success')
  })

  it('resolves the correct job when multiple actions race concurrently', async () => {
    const { tracker } = makeTracker()

    async function fastFailingAction(): Promise<string> {
      const id = 'job-fast'
      tracker.handleStart({ id, title: 'Fast validation' })
      tracker.handleDone({ id, success: false, exitCode: 1, error: 'invalid name' })
      return id
    }

    async function slowAction(): Promise<string> {
      const id = 'job-slow'
      tracker.handleStart({ id, title: 'Slow job' })
      return id
    }

    const fast = withTimeout(tracker.runAction(fastFailingAction), 200)
    const slowPromise = tracker.runAction(slowAction)
    await Promise.resolve()
    await Promise.resolve()
    tracker.handleDone({ id: 'job-slow', success: true, exitCode: 0 })
    const slow = await withTimeout(slowPromise, 200)

    const fastResult = await fast
    expect(fastResult.status).toBe('error')
    expect(fastResult.error).toBe('invalid name')
    expect(slow.status).toBe('success')
  })
})

// A quiet job (e.g. the periodic background `brew update`, see
// App.UpdateQuiet) must still land in the job list -- it's meant to be
// visible in job history if the user goes looking -- but must not steal
// focus or pop a toast the way a normal, user-initiated job does.
describe('quiet jobs', () => {
  it('does not call onJobStarted, but still appears in the job list', () => {
    const { tracker, jobsSnapshots } = makeTracker()

    tracker.handleStart({ id: 'job-quiet', title: 'Update Homebrew', quiet: true })

    expect(jobsSnapshots.at(-1)).toEqual([
      expect.objectContaining({ id: 'job-quiet', title: 'Update Homebrew', quiet: true, status: 'running' }),
    ])
  })

  it('does not push a toast on success or failure', () => {
    const { tracker, notifications } = makeTracker()

    tracker.handleStart({ id: 'job-quiet-ok', title: 'Update Homebrew', quiet: true })
    tracker.handleDone({ id: 'job-quiet-ok', success: true, exitCode: 0 })

    tracker.handleStart({ id: 'job-quiet-fail', title: 'Update Homebrew', quiet: true })
    tracker.handleDone({ id: 'job-quiet-fail', success: false, exitCode: 1, error: 'offline' })

    expect(notifications).toEqual([])
  })

  it('still resolves runAction, so the caller can react to completion (e.g. refresh the UI)', async () => {
    const { tracker } = makeTracker()

    async function quietAction(): Promise<string> {
      const id = 'job-quiet-resolve'
      tracker.handleStart({ id, title: 'Update Homebrew', quiet: true })
      tracker.handleDone({ id, success: true, exitCode: 0 })
      return id
    }

    const result = await withTimeout(tracker.runAction(quietAction), 200)
    expect(result.status).toBe('success')
  })

  it('a non-quiet job (the default) still calls onJobStarted and pushes a toast, unaffected by the quiet path', () => {
    const notifications: Array<{ type: string; message: string }> = []
    const started: string[] = []
    const tracker = new JobTracker({
      onJobsChange: () => {},
      onNotify: (type, message) => notifications.push({ type, message }),
      onJobStarted: (id) => started.push(id),
    })

    tracker.handleStart({ id: 'job-loud', title: 'Install wget' })
    tracker.handleDone({ id: 'job-loud', success: true, exitCode: 0 })

    expect(started).toEqual(['job-loud'])
    expect(notifications).toEqual([{ type: 'success', message: 'Install wget — done' }])
  })
})

// Reproduces the shape of the ORIGINAL (pre-fix) resolver bookkeeping in
// JobsContext.tsx: the resolver was registered only *after* `action()`
// resolved, with no fallback check for a job that had already reached a
// terminal state. This demonstrates why that shape hangs under the exact
// same race the fix above (JobTracker.runAction) handles correctly.
describe('naive (pre-fix) resolver registration', () => {
  it('hangs when job:done fires before the resolver is registered', async () => {
    const resolvers = new Map<string, (job: JobState) => void>()

    function handleDone(payload: { id: string; success: boolean; exitCode: number; error?: string }) {
      const job: JobState = {
        id: payload.id,
        title: 'Import Brewfile',
        lines: [],
        quiet: false,
        status: payload.success ? 'success' : 'error',
        exitCode: payload.exitCode,
        error: payload.error,
        startedAt: Date.now(),
        endedAt: Date.now(),
      }
      const resolve = resolvers.get(payload.id)
      if (resolve) {
        resolve(job)
        resolvers.delete(payload.id)
      }
      // No durable record of `job` is kept for late resolvers to consult —
      // this is exactly the bug: a job:done that arrives with no resolver
      // yet registered is simply lost.
    }

    async function raceyAction(): Promise<string> {
      const id = 'job-1'
      handleDone({ id, success: false, exitCode: 1, error: 'cancelled' })
      return id
    }

    async function naiveRunAction(action: () => Promise<string>): Promise<JobState> {
      const id = await action()
      // BUG: registers the resolver unconditionally, with no check for an
      // already-terminal job — waits forever for a job:done that, in the
      // race above, already happened.
      return new Promise<JobState>((resolve) => {
        resolvers.set(id, resolve)
      })
    }

    await expect(withTimeout(naiveRunAction(raceyAction), 50)).rejects.toThrow('timed out')
  })
})
