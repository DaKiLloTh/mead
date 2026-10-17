import { signal } from '@preact/signals'
import { EventsOn } from '../../wailsjs/runtime'
import { api } from '../lib/api'
import { JobTracker, type JobState, type JobLine } from './jobTracker'

export type { JobState, JobLine }

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// Module-level signal store for jobs, toasts and the job console. The file
// keeps its old name so .storybook/main.ts can keep aliasing it to the
// inert mock in .storybook/mocks/JobsContext.tsx.
export const jobsSignal = signal<JobState[]>([])
export const toastsSignal = signal<Toast[]>([])
export const consoleOpenSignal = signal(false)
export const selectedJobIdSignal = signal<string | null>(null)

function dismissToast(id: string) {
  toastsSignal.value = toastsSignal.value.filter((x) => x.id !== id)
}

function pushToast(type: Toast['type'], message: string) {
  const id = Math.random().toString(36).slice(2)
  toastsSignal.value = [...toastsSignal.value, { id, type, message }]
  setTimeout(() => dismissToast(id), 5000)
}

// The tracker owns the authoritative, synchronously-updated job list and
// resolver bookkeeping (see jobTracker.ts for why this must live outside
// rendered state to avoid the job:done-vs-RPC-promise race). jobsSignal is
// just a mirror of it, for rendering.
const tracker = new JobTracker({
  onJobsChange: (next) => (jobsSignal.value = next),
  onNotify: (type, message) => pushToast(type, message),
  onJobStarted: (id) => {
    selectedJobIdSignal.value = id
    consoleOpenSignal.value = true
  },
})

let eventsStarted = false

/** Subscribes the tracker to the backend's job events, once. Called from App on mount. */
export function startJobEvents() {
  if (eventsStarted) return
  eventsStarted = true
  EventsOn('job:start', tracker.handleStart)
  EventsOn('job:output', tracker.handleOutput)
  EventsOn('job:done', tracker.handleDone)
}

function runAction(action: () => Promise<string>): Promise<JobState> {
  return tracker.runAction(action)
}

function cancelJob(id: string) {
  void api.cancelJob(id)
}

function clearFinishedJobs() {
  tracker.clearFinished()
  selectedJobIdSignal.value = null
}

export function useJobs() {
  const jobs = jobsSignal.value
  return {
    jobs,
    activeCount: jobs.filter((j) => j.status === 'running').length,
    toasts: toastsSignal.value,
    dismissToast,
    runAction,
    notify: pushToast,
    consoleOpen: consoleOpenSignal.value,
    setConsoleOpen: (open: boolean) => (consoleOpenSignal.value = open),
    selectedJobId: selectedJobIdSignal.value,
    setSelectedJobId: (id: string | null) => (selectedJobIdSignal.value = id),
    cancelJob,
    clearFinishedJobs,
  }
}
