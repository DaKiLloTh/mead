import type { Meta, StoryObj } from '@storybook/preact-vite'
import Toasts from './Toasts'

// Toasts reads from useJobs() -- the .storybook/main.ts alias redirects
// that import to .storybook/mocks/JobsContext.tsx, which returns a fixed
// empty toast list, so by default this renders nothing (correctly: no
// toasts, no UI). Proves the context-mocking path itself works; a real
// toast list needs the mock extended with sample data to actually show
// anything, left for whoever needs that next.
const meta: Meta<typeof Toasts> = {
  title: 'Components/Toasts',
  component: Toasts,
}
export default meta

type Story = StoryObj<typeof Toasts>

export const Empty: Story = {}
