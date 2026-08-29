import type { Meta, StoryObj } from '@storybook/preact-vite'
import { useState } from 'preact/hooks'
import Sidebar, { type ViewKey } from './Sidebar'

// Sidebar takes no context, just props -- a real (not mocked) working
// component in a story, wired to Preact state so clicking a nav item in
// the Storybook canvas actually changes which one is highlighted, the
// same way it does in the real app.
function InteractiveSidebar(props: { outdatedCount: number }) {
  const [view, setView] = useState<ViewKey>('dashboard')
  return <Sidebar view={view} onSelect={setView} outdatedCount={props.outdatedCount} />
}

const meta: Meta<typeof InteractiveSidebar> = {
  title: 'Components/Sidebar',
  component: InteractiveSidebar,
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    outdatedCount: 3,
  },
}
export default meta

type Story = StoryObj<typeof InteractiveSidebar>

export const Default: Story = {}

export const NothingOutdated: Story = {
  args: { outdatedCount: 0 },
}
