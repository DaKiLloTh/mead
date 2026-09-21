import type { Meta, StoryObj } from '@storybook/preact-vite'
import ResultCard from './ResultCard'
import TypeBadge from './TypeBadge'

const meta: Meta<typeof ResultCard> = {
  title: 'Components/ResultCard',
  component: ResultCard,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    onClick: { control: false },
    headerRight: { control: false },
    footerLeft: { control: false },
    footerRight: { control: false },
  },
  args: {
    title: 'wget',
    description: 'Internet file retriever',
    headerRight: <TypeBadge isCask={false} />,
    footerLeft: <span className="font-mono text-xs text-base-content/60">1.25.0</span>,
    footerRight: <button className="btn btn-xs btn-primary">Install</button>,
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ResultCard>

export const Default: Story = {}

export const Clickable: Story = {
  args: { onClick: () => console.log('[storybook] onClick') },
}

export const WithBody: Story = {
  args: {
    children: <p className="text-xs">Extra content sits between the header and the footer.</p>,
  },
}

export const NoDescription: Story = {
  args: { description: '' },
}
