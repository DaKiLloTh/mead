import type { Meta, StoryObj } from '@storybook/preact-vite'
import { useArgs } from 'storybook/preview-api'
import Sidebar, { navItems, type ViewKey } from './Sidebar'

// `view` is genuinely two-way bound: the Controls panel's select can change
// it, and clicking a nav item in the canvas updates the same arg back via
// useArgs()'s setter -- Storybook's documented "controlled component"
// pattern. useArgs must be called directly in the function assigned to
// meta.render -- that's the one call Storybook's hooks system actually
// wraps; calling it one JSX level deeper, in a component *rendered by*
// render(), throws "Storybook preview hooks can only be called inside
// decorators and story functions" (confirmed by trying that first). Named
// `Render` (not an inline arrow) purely so react-hooks/rules-of-hooks'
// naming heuristic recognizes it as a component and allows the hook call.
function Render(args: { view: ViewKey; outdatedCount: number }) {
  const [, updateArgs] = useArgs<typeof args>()
  return <Sidebar {...args} onSelect={(v) => updateArgs({ view: v })} />
}

const meta: Meta<typeof Sidebar> = {
  title: 'Components/Sidebar',
  component: Sidebar,
  argTypes: {
    view: {
      control: 'select',
      options: navItems.map((item) => item.key),
    },
    outdatedCount: { control: { type: 'number', min: 0 } },
    onHover: { control: false },
  },
  args: {
    view: 'dashboard',
    outdatedCount: 3,
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
  render: Render,
}
export default meta

type Story = StoryObj<typeof Sidebar>

export const Default: Story = {}

export const NothingOutdated: Story = {
  args: { outdatedCount: 0 },
}
