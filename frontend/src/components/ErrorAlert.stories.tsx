import type { Meta, StoryObj } from '@storybook/preact-vite'
import ErrorAlert from './ErrorAlert'

const meta: Meta<typeof ErrorAlert> = {
  title: 'Components/ErrorAlert',
  component: ErrorAlert,
  argTypes: {
    title: { control: 'text' },
    message: { control: 'text' },
    onRetry: { control: false },
    className: { control: 'text' },
  },
  args: {
    title: "Couldn't load installed packages",
    message: 'brew list failed: exit status 1',
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ErrorAlert>

export const WithRetry: Story = {
  args: { onRetry: () => console.log('[storybook] onRetry') },
}

export const WithoutRetry: Story = {}
