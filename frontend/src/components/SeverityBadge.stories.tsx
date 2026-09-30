import type { Meta, StoryObj } from '@storybook/preact-vite'
import SeverityBadge from './SeverityBadge'

const meta: Meta<typeof SeverityBadge> = {
  title: 'Components/SeverityBadge',
  component: SeverityBadge,
  argTypes: {
    severity: { control: 'select', options: ['critical', 'high', 'medium', 'low', 'unknown'] },
    size: { control: 'select', options: ['xs', 'sm'] },
  },
  args: {
    severity: 'medium',
    size: 'sm',
  },
}
export default meta

type Story = StoryObj<typeof SeverityBadge>

export const Medium: Story = {}

export const Critical: Story = {
  args: { severity: 'critical' },
}

export const High: Story = {
  args: { severity: 'high' },
}

export const Low: Story = {
  args: { severity: 'low' },
}

export const Unknown: Story = {
  args: { severity: 'unknown' },
}

export const ExtraSmall: Story = {
  args: { size: 'xs' },
}

export const AllSeverities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      {(['critical', 'high', 'medium', 'low', 'unknown'] as const).map((severity) => (
        <SeverityBadge key={severity} severity={severity} />
      ))}
    </div>
  ),
}
