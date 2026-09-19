import type { Meta, StoryObj } from '@storybook/preact-vite'
import JobConsole from './JobConsole'
import {
  mockJobsSignal,
  mockConsoleOpenSignal,
  mockSelectedJobIdSignal,
  type JobState,
} from '../../.storybook/mocks/JobsContext'

const runningJob: JobState = {
  id: 'install-wget',
  title: 'Install wget',
  status: 'running',
  startedAt: Date.now() - 4_000,
  quiet: false,
  interactive: false,
  lines: [
    { stream: 'stdout', text: '==> Downloading https://ghcr.io/v2/homebrew/core/wget/manifests/1.25.0' },
    { stream: 'stdout', text: '==> Pouring wget--1.25.0.arm64_sequoia.bottle.tar.gz' },
  ],
}

const finishedJob: JobState = {
  id: 'upgrade-ffmpeg',
  title: 'Upgrade ffmpeg',
  status: 'success',
  startedAt: Date.now() - 60_000,
  endedAt: Date.now() - 55_000,
  quiet: false,
  interactive: false,
  lines: [{ stream: 'stdout', text: '🍺  ffmpeg 8.0 is already installed' }],
}

const failedJob: JobState = {
  id: 'uninstall-broken',
  title: 'Uninstall broken-formula',
  status: 'error',
  exitCode: 1,
  startedAt: Date.now() - 30_000,
  endedAt: Date.now() - 29_000,
  quiet: false,
  interactive: false,
  lines: [{ stream: 'stderr', text: 'Error: Permission denied @ unlink_internal' }],
}

// An interactive (pty-backed) job waiting on a password -- see
// App.SendJobInput/jobs.Manager.StartMas. The "Password:" line has no
// trailing newline on the real terminal, which is exactly why it's its own
// line here rather than tacked onto the previous one: splitPTYChunk (Go
// side) flushes an unterminated prompt immediately rather than waiting for
// a delimiter that would never arrive before the user responds.
const awaitingPasswordJob: JobState = {
  id: 'upgrade-xcode',
  title: 'Upgrade App Store app 497799835',
  status: 'running',
  startedAt: Date.now() - 8_000,
  quiet: false,
  interactive: true,
  lines: [
    { stream: 'stdout', text: 'Downloading Xcode (12.1 GB)' },
    { stream: 'stdout', text: 'Installing Xcode' },
    { stream: 'stdout', text: 'Password:' },
  ],
}

const scenarios = {
  empty: [],
  running: [runningJob],
  runningAndFinished: [finishedJob, runningJob],
  failed: [failedJob],
  mixed: [finishedJob, runningJob, failedJob],
  awaitingPassword: [awaitingPasswordJob],
} as const

type Scenario = keyof typeof scenarios

interface StoryArgs {
  scenario: Scenario
  consoleOpen: boolean
}

// JobConsole takes no props at all -- its entire state (jobs, consoleOpen,
// selectedJobId) comes from useJobs(), which .storybook/main.ts aliases to
// the signal-backed mock in .storybook/mocks/JobsContext.tsx. So instead of
// argTypes mapping to real component props, this story's args map to
// "preset scenario" + "expanded" controls, and the render function pushes
// those into the mock signals -- the same effect as Controls driving props
// directly, just one level removed through the mocked context.
const meta: Meta<StoryArgs> = {
  title: 'Components/JobConsole',
  argTypes: {
    scenario: {
      control: 'select',
      options: Object.keys(scenarios) as Scenario[],
      description: 'Which set of fake jobs useJobs() returns',
    },
    consoleOpen: { control: 'boolean' },
  },
  args: {
    scenario: 'runningAndFinished',
    consoleOpen: true,
  },
  render: (args) => {
    const jobs = [...scenarios[args.scenario]]
    mockJobsSignal.value = jobs
    mockConsoleOpenSignal.value = args.consoleOpen
    mockSelectedJobIdSignal.value = jobs[jobs.length - 1]?.id ?? null
    return <JobConsole />
  },
}
export default meta

type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Empty: Story = {
  args: { scenario: 'empty' },
}

export const Failed: Story = {
  args: { scenario: 'failed' },
}

export const Collapsed: Story = {
  args: { scenario: 'running', consoleOpen: false },
}

export const AwaitingPassword: Story = {
  args: { scenario: 'awaitingPassword' },
}
