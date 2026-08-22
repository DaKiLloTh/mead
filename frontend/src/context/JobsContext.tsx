import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
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

const JobsContext = createContext<JobsContextValue | null>(null)

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs must be used within a JobsProvider')
  return ctx
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<JobState[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const pushToast = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, type, message }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 5000)
  }, [])

  // The tracker owns the authoritative, synchronously-updated job list and
  // resolver bookkeeping (see jobTracker.ts for why this must live outside
  // React state to avoid the job:done-vs-RPC-promise race). React state
  // (`jobs` above) is just a mirror of it, for rendering.
  const trackerRef = useRef<JobTracker | null>(null)
  if (!trackerRef.current) {
    trackerRef.current = new JobTracker({
      onJobsChange: (next) => setJobs(next),
      onNotify: (type, message) => pushToast(type, message),
      onJobStarted: (id) => {
        setSelectedJobId(id)
        setConsoleOpen(true)
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
    setSelectedJobId(null)
  }, [])

  const activeCount = jobs.filter((j) => j.status === 'running').length

  const value: JobsContextValue = {
    jobs,
    activeCount,
    toasts,
    dismissToast,
    runAction,
    notify: pushToast,
    consoleOpen,
    setConsoleOpen,
    selectedJobId,
    setSelectedJobId,
    cancelJob,
    clearFinishedJobs,
  }

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
