import type { Meta, StoryObj } from '@storybook/preact-vite'
import BundleEntryBadge from './BundleEntryBadge'

const meta: Meta<typeof BundleEntryBadge> = {
  title: 'Components/BundleEntryBadge',
  component: BundleEntryBadge,
  argTypes: {
    type: {
      control: 'select',
      options: ['formula', 'cask', 'tap', 'mas', 'vscode', 'go', 'cargo', 'uv', 'flatpak', 'winget', 'krew', 'npm'],
    },
    size: { control: 'select', options: ['xs', 'sm'] },
  },
  args: {
    type: 'formula',
    size: 'sm',
  },
}
export default meta

type Story = StoryObj<typeof BundleEntryBadge>

export const Formula: Story = {}

export const Cask: Story = {
  args: { type: 'cask' },
}

export const Tap: Story = {
  args: { type: 'tap' },
}

export const MacAppStore: Story = {
  args: { type: 'mas' },
}

export const VSCode: Story = {
  args: { type: 'vscode' },
}

export const Go: Story = {
  args: { type: 'go' },
}

export const Cargo: Story = {
  args: { type: 'cargo' },
}

export const Uv: Story = {
  args: { type: 'uv' },
}

export const Flatpak: Story = {
  args: { type: 'flatpak' },
}

export const Winget: Story = {
  args: { type: 'winget' },
}

export const Krew: Story = {
  args: { type: 'krew' },
}

export const Npm: Story = {
  args: { type: 'npm' },
}

export const ExtraSmall: Story = {
  args: { size: 'xs' },
}

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      {(
        ['formula', 'cask', 'tap', 'mas', 'vscode', 'go', 'cargo', 'uv', 'flatpak', 'winget', 'krew', 'npm'] as const
      ).map((type) => (
        <BundleEntryBadge key={type} type={type} />
      ))}
    </div>
  ),
}
