// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/preact'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({
    jobs: [],
    activeCount: 0,
    consoleOpen: false,
    setConsoleOpen: vi.fn(),
    selectedJobId: null,
    setSelectedJobId: vi.fn(),
    cancelJob: vi.fn(),
    clearFinishedJobs: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({ api: { sendJobInput: vi.fn(), gistLogs: vi.fn() } }))

import JobConsole from './JobConsole'

afterEach(cleanup)

describe('JobConsole', () => {
  it('renders without crashing when there are no jobs', () => {
    expect(() => render(<JobConsole />)).not.toThrow()
  })
})
