import { useSignal } from '@preact/signals'
import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useRef } from 'preact/hooks'
import { EventsOn } from '../../wailsjs/runtime'
import { api } from '../lib/api'
import { JobTracker, type JobState, type JobLine } from './jobTracker'

export type { JobState, JobLine }

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface JobsContextValue {
  jobs: JobState[]
  activeCount: number
  toasts: Toast[]
  dismissToast: (id: string) => void
  runAction: (action: () => Promise<string>) => Promise<JobState>
  notify: (type: Toast['type'], message: string) => void
  consoleOpen: boolean
  setConsoleOpen: (open: boolean) => void
  selectedJobId: string | null
  setSelectedJobId: (id: string | null) => void
  cancelJob: (id: string) => void
  clearFinishedJobs: () => void
}

// Left as Context, not converted to a signal: the job list's authoritative
// source of truth already lives outside React state, in JobTracker (see
// jobTracker.ts), specifically to avoid a synchronization race against the
// live event bus. Converting the React-facing mirror (`jobs` state below) to
// a signal would just move where that mirror lives, not remove the tracker,
// so it isn't a real simplification.
const JobsContext = createContext<JobsContextValue | null>(null)

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs must be used within a JobsProvider')
  return ctx
}

export function JobsProvider({ children }: { children: ComponentChildren }) {
  const jobs = useSignal<JobState[]>([])
  const toasts = useSignal<Toast[]>([])
  const consoleOpen = useSignal(false)
  const selectedJobId = useSignal<string | null>(null)

  const dismissToast = useCallback(
    (id: string) => {
      toasts.value = toasts.value.filter((x) => x.id !== id)
    },
    [toasts]
  )

  const pushToast = useCallback(
    (type: Toast['type'], message: string) => {
      const id = Math.random().toString(36).slice(2)
      toasts.value = [...toasts.value, { id, type, message }]
      setTimeout(() => {
        toasts.value = toasts.value.filter((x) => x.id !== id)
      }, 5000)
    },
    [toasts]
  )

  // The tracker owns the authoritative, synchronously-updated job list and
  // resolver bookkeeping (see jobTracker.ts for why this must live outside
  // React state to avoid the job:done-vs-RPC-promise race). React state
  // (`jobs` above) is just a mirror of it, for rendering.
  const trackerRef = useRef<JobTracker | null>(null)
  // Lazy ref initialization: reading/writing .current during render is only
  // unsafe in general because it can produce inconsistent output across
  // renders, but this specific "create once, guarded by a null check" shape
  // is the documented exception (https://react.dev/reference/react/useRef).
  // eslint-disable-next-line react-hooks/refs
  if (!trackerRef.current) {
    trackerRef.current = new JobTracker({
      onJobsChange: (next) => (jobs.value = next),
      onNotify: (type, message) => pushToast(type, message),
      onJobStarted: (id) => {
        selectedJobId.value = id
        consoleOpen.value = true
      },
    })
  }

  useEffect(() => {
    const tracker = trackerRef.current!
    const offStart = EventsOn('job:start', tracker.handleStart)
    const offOutput = EventsOn('job:output', tracker.handleOutput)
    const offDone = EventsOn('job:done', tracker.handleDone)

    return () => {
      offStart()
      offOutput()
      offDone()
    }
  }, [])

  const runAction = useCallback((action: () => Promise<string>): Promise<JobState> => {
    return trackerRef.current!.runAction(action)
  }, [])

  const cancelJob = useCallback((id: string) => {
    void api.cancelJob(id)
  }, [])

  const clearFinishedJobs = useCallback(() => {
    trackerRef.current!.clearFinished()
    selectedJobId.value = null
  }, [selectedJobId])

  const activeCount = jobs.value.filter((j) => j.status === 'running').length

  const value: JobsContextValue = {
    jobs: jobs.value,
    activeCount,
    toasts: toasts.value,
    dismissToast,
    runAction,
    notify: pushToast,
    consoleOpen: consoleOpen.value,
    setConsoleOpen: (v) => (consoleOpen.value = v),
    selectedJobId: selectedJobId.value,
    setSelectedJobId: (v) => (selectedJobId.value = v),
    cancelJob,
    clearFinishedJobs,
  }

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
