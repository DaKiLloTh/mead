// Storybook stand-in for ../../src/context/JobsContext.tsx, aliased in
// .storybook/main.ts. mead's real JobsProvider ultimately drives real
// Wails-bound job subprocesses (brew install/upgrade/etc.), which don't
// exist outside the Wails runtime -- Storybook renders in a plain browser,
// so any component that calls useJobs() needs a safe, inert stand-in
// rather than the real thing. Mirrors the same mock shape already
// established in src/views/Search.test.tsx.
import { signal } from '@preact/signals'
import type { JobState } from '../../src/context/jobTracker'

export type { JobState }

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// A signal (not a plain array) so a story can set mockJobsSignal.value in a
// decorator before rendering and have useJobs() below pick it up reactively
// -- JobConsole (the only real consumer of `jobs`) renders null when this
// is empty, so an empty default would make that story show nothing.
export const mockJobsSignal = signal<JobState[]>([])
// Same reasoning: Toasts renders null when this is empty (see
// Toasts.stories.tsx -- its first version left this hardcoded to [], so
// every one of its stories rendered nothing).
export const mockToastsSignal = signal<Toast[]>([])
// Real, not fixed -- so clicking the JobConsole header in the Storybook
// canvas actually expands/collapses it, same as the Sidebar story's
// approach of wiring mocked state to genuine interaction.
export const mockConsoleOpenSignal = signal(false)
export const mockSelectedJobIdSignal = signal<string | null>(null)

export function useJobs() {
  return {
    jobs: mockJobsSignal.value,
    activeCount: mockJobsSignal.value.filter((j) => j.status === 'running').length,
    toasts: mockToastsSignal.value,
    dismissToast: (id: string) => {
      mockToastsSignal.value = mockToastsSignal.value.filter((t) => t.id !== id)
    },
    runAction: async (action: () => Promise<string>): Promise<JobState> => {
      console.log('[storybook mock] runAction called')
      await action().catch(() => {})
      return {
        id: 'story-job',
        title: 'Story job',
        lines: [],
        status: 'success',
        startedAt: Date.now(),
        quiet: false,
        interactive: false,
      }
    },
    notify: (type: string, message: string) => {
      console.log(`[storybook mock] notify(${type}): ${message}`)
    },
    consoleOpen: mockConsoleOpenSignal.value,
    setConsoleOpen: (open: boolean) => {
      mockConsoleOpenSignal.value = open
    },
    selectedJobId: mockSelectedJobIdSignal.value,
    setSelectedJobId: (id: string) => {
      mockSelectedJobIdSignal.value = id
    },
    cancelJob: () => {},
    clearFinishedJobs: () => {
      mockJobsSignal.value = mockJobsSignal.value.filter((j) => j.status === 'running')
    },
  }
}
