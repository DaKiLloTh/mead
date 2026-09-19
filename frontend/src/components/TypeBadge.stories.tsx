import type { Meta, StoryObj } from '@storybook/preact-vite'
import TypeBadge from './TypeBadge'

const meta: Meta<typeof TypeBadge> = {
  title: 'Components/TypeBadge',
  component: TypeBadge,
  argTypes: {
    isCask: { control: 'boolean' },
    size: { control: 'select', options: ['xs', 'sm'] },
  },
  args: {
    isCask: false,
    size: 'sm',
  },
}
export default meta

type Story = StoryObj<typeof TypeBadge>

export const Formula: Story = {}

export const Cask: Story = {
  args: { isCask: true },
}

export const ExtraSmall: Story = {
  args: { size: 'xs' },
}
