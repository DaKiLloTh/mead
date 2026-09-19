import type { Meta, StoryObj } from '@storybook/preact-vite'
import ExternalLink from './ExternalLink'

// Clicking calls window.runtime.BrowserOpenURL, mocked globally in
// preview.tsx to console.log instead of opening anything -- see the
// browser's devtools console after clicking to confirm the href it fired.
const meta: Meta<typeof ExternalLink> = {
  title: 'Components/ExternalLink',
  component: ExternalLink,
  argTypes: {
    href: { control: 'text' },
    children: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    href: 'https://example.com',
    children: 'Visit example.com',
    className: 'link link-primary',
  },
}
export default meta

type Story = StoryObj<typeof ExternalLink>

export const Default: Story = {}
