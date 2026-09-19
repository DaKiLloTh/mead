import type { Meta, StoryObj } from '@storybook/preact-vite'
import { fn } from 'storybook/test'
import DependencyGraph from './DependencyGraph'
import { installedPackagesSignal } from '../context/InstalledPackagesSignal'
import { fakePackage } from '../../.storybook/mocks/wailsApi'

interface StoryArgs {
  name: string
  isCask: boolean
  installedNames: string
}

// `target` is a real prop, but a plain object control renders as an
// unfriendly raw-JSON editor -- splitting it into name/isCask primitive
// args gives proper text/boolean controls instead, recombined into the
// actual `target` object in render(). installedNames drives which of the
// mocked graph's nodes (see DepsGraph in .storybook/mocks/wailsApi.ts,
// which always returns <name> -> openssl@3, readline) show as installed
// (green) vs not (grey), the same coloring logic the real component uses.
const meta: Meta<StoryArgs> = {
  title: 'Components/DependencyGraph',
  argTypes: {
    name: { control: 'text' },
    isCask: { control: 'boolean' },
    installedNames: { control: 'text', description: 'Comma-separated names treated as installed' },
  },
  args: {
    name: 'wget',
    isCask: false,
    installedNames: 'wget, openssl@3',
  },
  decorators: [
    (Story) => (
      <div style={{ width: '600px' }}>
        <Story />
      </div>
    ),
  ],
  render: (args) => {
    installedPackagesSignal.value = {
      packages: args.installedNames
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => fakePackage(n, false)),
      loading: false,
      error: null,
    }
    return <DependencyGraph target={{ name: args.name, isCask: args.isCask }} onSelectPackage={fn()} />
  },
}
export default meta

type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const NothingInstalled: Story = {
  args: { installedNames: '' },
}
