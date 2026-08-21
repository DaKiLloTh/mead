import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { api } from '../lib/api'

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
  consoleOpen: boolean
  setConsoleOpen: (open: boolean) => void
  selectedJobId: string | null
  setSelectedJobId: (id: string | null) => void
  cancelJob: (id: string) => void
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

  const resolvers = useRef(new Map<string, (job: JobState) => void>())
  const jobsRef = useRef<JobState[]>([])
  jobsRef.current = jobs

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

  useEffect(() => {
    const offStart = EventsOn('job:start', (payload: { id: string; title: string }) => {
      setJobs((prev) => [
        ...prev,
        { id: payload.id, title: payload.title, lines: [], status: 'running', startedAt: Date.now() },
      ])
      setSelectedJobId(payload.id)
      setConsoleOpen(true)
    })

    const offOutput = EventsOn(
      'job:output',
      (payload: { id: string; line: string; stream: 'stdout' | 'stderr' }) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === payload.id ? { ...j, lines: [...j.lines, { stream: payload.stream, text: payload.line }] } : j
          )
        )
      }
    )

    const offDone = EventsOn(
      'job:done',
      (payload: { id: string; success: boolean; exitCode: number; error?: string }) => {
        setJobs((prev) => {
          const next = prev.map((j) =>
            j.id === payload.id
              ? {
                  ...j,
                  status: (payload.success ? 'success' : 'error') as JobState['status'],
                  exitCode: payload.exitCode,
                  error: payload.error,
                  endedAt: Date.now(),
                }
              : j
          )
          const job = next.find((j) => j.id === payload.id)
          if (job) {
            const resolve = resolvers.current.get(payload.id)
            if (resolve) {
              resolve(job)
              resolvers.current.delete(payload.id)
            }
            pushToast(
              payload.success ? 'success' : 'error',
              payload.success ? `${job.title} — done` : `${job.title} — failed${payload.error ? `: ${payload.error}` : ''}`
            )
          }
          return next
        })
      }
    )

    return () => {
      offStart()
      offOutput()
      offDone()
    }
  }, [pushToast])

  const runAction = useCallback(async (action: () => Promise<string>): Promise<JobState> => {
    const id = await action()
    const existing = jobsRef.current.find((j) => j.id === id)
    if (existing && existing.status !== 'running') {
      return existing
    }
    return new Promise<JobState>((resolve) => {
      resolvers.current.set(id, resolve)
    })
  }, [])

  const cancelJob = useCallback((id: string) => {
    void api.cancelJob(id)
  }, [])

  const activeCount = jobs.filter((j) => j.status === 'running').length

  const value: JobsContextValue = {
    jobs,
    activeCount,
    toasts,
    dismissToast,
    runAction,
    consoleOpen,
    setConsoleOpen,
    selectedJobId,
    setSelectedJobId,
    cancelJob,
  }

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}
