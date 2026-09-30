import type { Meta, StoryObj } from '@storybook/preact-vite'
import PatchedBadge from './PatchedBadge'

const meta: Meta<typeof PatchedBadge> = {
  title: 'Components/PatchedBadge',
  component: PatchedBadge,
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm'] },
  },
  args: {
    size: 'sm',
  },
}
export default meta

type Story = StoryObj<typeof PatchedBadge>

export const Default: Story = {}

export const ExtraSmall: Story = {
  args: { size: 'xs' },
}
