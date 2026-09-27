import type { Meta, StoryObj } from '@storybook/preact-vite'
import { useEffect } from 'preact/hooks'
import { useArgs } from 'storybook/preview-api'
import Sidebar, { navItems, type ViewKey } from './Sidebar'
import { capabilitiesSignal } from '../context/CapabilitiesSignal'
import { defaultCapabilities } from '../context/capabilitiesCache'
import type { Capabilities } from '../lib/api'

// Linux's capabilities per platform.Capabilities' darwin/linux
// implementations (internal/platform) -- everything this milestone gates
// is false: no App Store, no Adopt (/Applications scan), and no floating
// title bar (Wails' Linux backend always draws the window manager's own
// native decorations, see main.go's Linux options comment).
const linuxCapabilities: Capabilities = {
  hasGatekeeper: false,
  hasAppStore: false,
  hasTimeMachine: false,
  hasTouchID: false,
  hasAppAdoption: false,
  hasFloatingTitleBar: false,
}

type PlatformArg = 'macOS' | 'Linux'

// Sidebar reads capabilities from the real, shared capabilitiesSignal
// (populated from App.Capabilities() in the real app), not a prop -- same
// reasoning CommandPalette.stories.tsx documents for installedPackagesSignal.
// Seeding that signal directly from a Control, same pattern, is what makes
// "App Store"/"Adopt" actually disappear and the drag-region strip actually
// collapse when this story's Platform control is switched to Linux, rather
// than only rendering the macOS shape and hoping the reader takes the gating
// on faith.
interface StoryArgs {
  view: ViewKey
  outdatedCount: number
  platform: PlatformArg
}

function Render(args: StoryArgs) {
  const [, updateArgs] = useArgs<StoryArgs>()
  // A plain render-time assignment here trips the react-hooks
  // immutability rule (Render calls useArgs, so eslint treats it as a
  // component and flags mutating an external signal during render) --
  // an effect, same as the rule's own suggestion, is what CommandPalette
  // and JobConsole's stories get away without only because their render
  // functions don't call any hooks themselves.
  useEffect(() => {
    capabilitiesSignal.value = {
      caps: args.platform === 'Linux' ? linuxCapabilities : defaultCapabilities,
      loading: false,
      error: null,
    }
  }, [args.platform])
  return <Sidebar view={args.view} outdatedCount={args.outdatedCount} onSelect={(v) => updateArgs({ view: v })} />
}

const meta: Meta<StoryArgs> = {
  title: 'Components/Sidebar',
  argTypes: {
    view: {
      control: 'select',
      options: navItems.map((item) => item.key),
    },
    outdatedCount: { control: { type: 'number', min: 0 } },
    platform: {
      control: 'radio',
      options: ['macOS', 'Linux'],
      description: 'Which platform.Capabilities this story seeds the shared capabilitiesSignal with.',
    },
  },
  args: {
    view: 'dashboard',
    outdatedCount: 3,
    platform: 'macOS',
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

type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const NothingOutdated: Story = {
  args: { outdatedCount: 0 },
}

// Demonstrates milestone 1 of issue #105's capability gating for real: the
// App Store and Adopt nav items are absent (not disabled, not grayed out --
// genuinely not rendered, see navCapabilities.ts), and the drag-region strip
// above the brand row collapses to nothing, since Wails' Linux backend draws
// its own native title bar and there's no floating chrome to reserve space
// for.
export const LinuxPlatform: Story = {
  args: { platform: 'Linux' },
}
