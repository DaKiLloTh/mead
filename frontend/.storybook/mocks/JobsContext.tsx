// Storybook stand-in for ../../src/context/JobsContext.tsx, aliased in
// .storybook/main.ts. mead's real JobsProvider ultimately drives real
// Wails-bound job subprocesses (brew install/upgrade/etc.), which don't
// exist outside the Wails runtime -- Storybook renders in a plain browser,
// so any component that calls useJobs() needs a safe, inert stand-in
// rather than the real thing. Mirrors the same mock shape already
// established in src/views/Search.test.tsx.
import type { JobState } from '../../src/context/jobTracker'

export type { JobState }

export function useJobs() {
  return {
    jobs: [] as JobState[],
    activeCount: 0,
    toasts: [] as { id: string; type: 'success' | 'error' | 'info'; message: string }[],
    dismissToast: () => {},
    runAction: async (action: () => Promise<string>): Promise<JobState> => {
      console.log('[storybook mock] runAction called')
      await action().catch(() => {})
      return { id: 'story-job', title: 'Story job', lines: [], status: 'success', startedAt: Date.now(), quiet: false }
    },
    notify: (type: string, message: string) => {
      console.log(`[storybook mock] notify(${type}): ${message}`)
    },
    consoleOpen: false,
    setConsoleOpen: () => {},
    selectedJobId: null,
    setSelectedJobId: () => {},
    cancelJob: () => {},
    clearFinishedJobs: () => {},
  }
}
