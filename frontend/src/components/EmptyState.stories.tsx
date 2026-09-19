import type { Meta, StoryObj } from '@storybook/preact-vite'
import EmptyState from './EmptyState'
import { ClockIcon } from './Icons'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  args: {
    children: 'Nothing to show yet.',
  },
}
export default meta

type Story = StoryObj<typeof EmptyState>

export const NoIcon: Story = {}

export const WithIcon: Story = {
  args: {
    icon: ClockIcon,
    children: 'No activity yet.',
  },
}
