// Framework-independent job-tracking core, extracted from JobsContext so the
// resolver/race logic can be unit tested without rendering React.
//
// Why this exists: `runAction()` calls a Wails-bound RPC (`action()`) that
// kicks off a background job and returns the job's id once the RPC promise
// resolves. Some Go-side handlers finish (and emit `job:start` + `job:done`)
// *synchronously*, before that RPC promise itself resolves in JS — e.g. a
// cancelled file picker, or a fast validation failure. If the code that
// observes job completion only starts watching for `job:done` after the RPC
// promise resolves, it can miss a `job:done` that already fired, and hang
// forever.
//
// The fix here: `this.jobs` is a plain field mutated synchronously, in-line,
// by the `handleStart`/`handleOutput`/`handleDone` event handlers — it does
// not depend on React's render/commit cycle to become visible. So by the
// time `runAction()`'s `await action()` resumes, `this.jobs` already
// reflects any `job:done` that raced ahead of it, and `runAction` can detect
// the already-terminal job and resolve immediately instead of registering a
// resolver that will never be invoked.

export interface JobLine {
  stream: 'stdout' | 'stderr'
  text: string
}

export interface JobState {
  id: string
  title: string
  lines: JobLine[]
  status: 'running' | 'success' | 'error'
  exitCode?: number
  error?: string
  startedAt: number
  endedAt?: number
}

export type ToastType = 'success' | 'error' | 'info'

export interface JobStartPayload {
  id: string
  title: string
}

export interface JobOutputPayload {
  id: string
  line: string
  stream: 'stdout' | 'stderr'
}

export interface JobDonePayload {
  id: string
  success: boolean
  exitCode: number
  error?: string
}

export interface JobTrackerCallbacks {
  /** Called synchronously whenever the tracked job list changes, so a host (e.g. React) can mirror it. */
  onJobsChange: (jobs: JobState[]) => void
  onNotify: (type: ToastType, message: string) => void
  /** Called when a new job starts (e.g. to auto-select it / open a console). */
  onJobStarted?: (id: string) => void
  /** Injectable clock, primarily for tests. */
  now?: () => number
}

export class JobTracker {
  private jobs: JobState[] = []
  private readonly resolvers = new Map<string, (job: JobState) => void>()
  private readonly callbacks: JobTrackerCallbacks
  private readonly now: () => number

  constructor(callbacks: JobTrackerCallbacks) {
    this.callbacks = callbacks
    this.now = callbacks.now ?? (() => Date.now())
  }

  clearFinished(): void {
    this.setJobs(this.jobs.filter((j) => j.status === 'running'))
  }

  private setJobs(next: JobState[]) {
    this.jobs = next
    this.callbacks.onJobsChange(next)
  }

  handleStart = (payload: JobStartPayload): void => {
    this.setJobs([
      ...this.jobs,
      { id: payload.id, title: payload.title, lines: [], status: 'running', startedAt: this.now() },
    ])
    this.callbacks.onJobStarted?.(payload.id)
  }

  handleOutput = (payload: JobOutputPayload): void => {
    this.setJobs(
      this.jobs.map((j) =>
        j.id === payload.id ? { ...j, lines: [...j.lines, { stream: payload.stream, text: payload.line }] } : j
      )
    )
  }

  handleDone = (payload: JobDonePayload): void => {
    const next = this.jobs.map((j) =>
      j.id === payload.id
        ? {
            ...j,
            status: (payload.success ? 'success' : 'error') as JobState['status'],
            exitCode: payload.exitCode,
            error: payload.error,
            endedAt: this.now(),
          }
        : j
    )
    this.setJobs(next)

    const job = next.find((j) => j.id === payload.id)
    if (!job) return

    const resolve = this.resolvers.get(payload.id)
    if (resolve) {
      resolve(job)
      this.resolvers.delete(payload.id)
    }

    this.callbacks.onNotify(
      payload.success ? 'success' : 'error',
      payload.success ? `${job.title} — done` : `${job.title} — failed${payload.error ? `: ${payload.error}` : ''}`
    )
  }

  /**
   * Runs a Wails-bound RPC that starts a background job and returns its id.
   * Resolves once the job reaches a terminal state, even if `job:done` (and
   * `job:start`) already fired before `action()`'s own promise resolved.
   */
  runAction = async (action: () => Promise<string>): Promise<JobState> => {
    const id = await action()
    // `this.jobs` is updated synchronously by handleStart/handleDone above,
    // independent of any React re-render, so this reliably reflects a
    // job:done that raced ahead of `action()` resolving.
    const existing = this.jobs.find((j) => j.id === id)
    if (existing && existing.status !== 'running') {
      return existing
    }
    return new Promise<JobState>((resolve) => {
      this.resolvers.set(id, resolve)
    })
  }
}
