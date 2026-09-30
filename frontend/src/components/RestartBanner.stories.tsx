import type { Meta, StoryObj } from '@storybook/preact-vite'
import RestartBanner from './RestartBanner'

const meta: Meta<typeof RestartBanner> = {
  title: 'Components/RestartBanner',
  component: RestartBanner,
  argTypes: {
    version: { control: 'text' },
    onRestart: { control: false },
  },
  args: {
    version: '0.12.0',
    onRestart: () => console.log('[storybook] onRestart'),
  },
}
export default meta

type Story = StoryObj<typeof RestartBanner>

export const Default: Story = {}
