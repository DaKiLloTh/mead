import type { Meta, StoryObj } from '@storybook/preact-vite'
import Toasts from './Toasts'
import { mockToastsSignal, type Toast } from '../../.storybook/mocks/JobsContext'

// Toasts reads from useJobs() -- the .storybook/main.ts alias redirects
// that import to .storybook/mocks/JobsContext.tsx, whose `toasts` field is
// a signal (mockToastsSignal) a story can set before rendering. It used to
// be hardcoded to [], so every story here rendered nothing -- Toasts
// returns null whenever the list is empty, same as JobConsole with no jobs.
const meta: Meta<typeof Toasts> = {
  title: 'Components/Toasts',
  component: Toasts,
}
export default meta

type Story = StoryObj<typeof Toasts>

export const Empty: Story = {
  decorators: [
    (Story) => {
      mockToastsSignal.value = []
      return <Story />
    },
  ],
}

export const Success: Story = {
  decorators: [
    (Story) => {
      mockToastsSignal.value = [{ id: '1', type: 'success', message: 'wget installed successfully' }]
      return <Story />
    },
  ],
}

export const Error: Story = {
  decorators: [
    (Story) => {
      mockToastsSignal.value = [{ id: '1', type: 'error', message: 'Failed to uninstall: permission denied' }]
      return <Story />
    },
  ],
}

export const Multiple: Story = {
  decorators: [
    (Story) => {
      const toasts: Toast[] = [
        { id: '1', type: 'success', message: 'wget installed successfully' },
        { id: '2', type: 'info', message: 'Checking for updates…' },
        { id: '3', type: 'error', message: 'Failed to uninstall broken-formula' },
      ]
      mockToastsSignal.value = toasts
      return <Story />
    },
  ],
}
