import type { Meta, StoryObj } from '@storybook/preact-vite'
import LoadingRow from './LoadingRow'

const meta: Meta<typeof LoadingRow> = {
  title: 'Components/LoadingRow',
  component: LoadingRow,
  args: {
    children: 'Loading…',
  },
}
export default meta

type Story = StoryObj<typeof LoadingRow>

export const Default: Story = {}
