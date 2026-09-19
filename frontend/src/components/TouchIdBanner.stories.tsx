import type { Meta, StoryObj } from '@storybook/preact-vite'
import TouchIdBanner from './TouchIdBanner'

const meta: Meta<typeof TouchIdBanner> = {
  title: 'Components/TouchIdBanner',
  component: TouchIdBanner,
  argTypes: {
    waiting: { control: 'boolean' },
    onEnable: { control: false },
  },
  args: {
    waiting: false,
    onEnable: () => console.log('[storybook] onEnable'),
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TouchIdBanner>

export const Offer: Story = {}

export const WaitingForTerminal: Story = {
  args: { waiting: true },
}
