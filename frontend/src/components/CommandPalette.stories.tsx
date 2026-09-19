import type { Meta, StoryObj } from '@storybook/preact-vite'
import { fn } from 'storybook/test'
import CommandPalette from './CommandPalette'
import { installedPackagesSignal } from '../context/InstalledPackagesSignal'
import { fakePackage } from '../../.storybook/mocks/wailsApi'

const packagePool: [string, boolean][] = [
  ['wget', false],
  ['visual-studio-code', true],
  ['ffmpeg', false],
  ['docker', true],
  ['imagemagick', false],
  ['zoom', true],
  ['postgresql@16', false],
  ['iterm2', true],
]

interface StoryArgs {
  packageCount: number
}

// CommandPalette owns its open/query/selection state internally (it's a
// global Cmd+K overlay, not something a parent drives via props) -- so
// there's no `open` prop for Controls to bind to. What genuinely varies
// story to story is the seeded package list it searches, which comes from
// the shared installedPackagesSignal, so that's what packageCount controls.
//
// Getting it to render open used to simulate a real Cmd+K keydown (either
// via a play function or a mount-time effect). Both dispatch a real
// KeyboardEvent that bubbles to `window` -- which Storybook's own manager
// UI ALSO listens on globally for its own Cmd+K search shortcut, so every
// time this story mounted it was also hijacking Storybook's sidebar
// (resetting the component list, filtering it, jumping to favorites).
// CommandPalette.tsx now accepts an optional `defaultOpen` prop instead --
// harmless to the real app (App.tsx never passes it) and lets this story
// render open with zero synthetic DOM events.
const meta: Meta<StoryArgs> = {
  title: 'Components/CommandPalette',
  argTypes: {
    packageCount: { control: { type: 'range', min: 0, max: packagePool.length, step: 1 } },
  },
  args: {
    packageCount: 4,
  },
  render: (args) => {
    installedPackagesSignal.value = {
      packages: packagePool.slice(0, args.packageCount).map(([name, isCask]) => fakePackage(name, isCask)),
      loading: false,
      error: null,
    }
    return <CommandPalette defaultOpen onNavigate={fn()} />
  },
}
export default meta

type Story = StoryObj<StoryArgs>

export const Open: Story = {}

export const NoPackagesInstalled: Story = {
  args: { packageCount: 0 },
}
