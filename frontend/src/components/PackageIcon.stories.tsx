import type { Meta, StoryObj } from '@storybook/preact-vite'
import PackageIcon from './PackageIcon'

// CaskIcon/MasAppIcon are mocked to resolve empty (see
// .storybook/mocks/wailsApi.ts), so every variant here renders the
// monogram fallback -- real icon extraction only happens against an
// actual installed cask/app, which doesn't exist in Storybook. This still
// proves the deterministic monogram coloring/lettering for a spread of
// names.
const meta: Meta<typeof PackageIcon> = {
  title: 'Components/PackageIcon',
  component: PackageIcon,
  argTypes: {
    name: { control: 'text' },
    isCask: { control: 'boolean' },
    isMas: { control: 'boolean' },
    className: {
      control: 'select',
      options: ['size-5', 'size-6', 'size-8', 'size-10', 'size-16'],
    },
  },
  args: {
    name: 'wget',
    isCask: false,
    isMas: false,
    className: 'size-10',
  },
}
export default meta

type Story = StoryObj<typeof PackageIcon>

export const Formula: Story = {}

export const Cask: Story = {
  args: { name: 'visual-studio-code', isCask: true },
}

function Grid() {
  const names = ['wget', 'visual-studio-code', 'ffmpeg', 'docker', 'imagemagick', 'zoom']
  return (
    <div className="flex gap-3 p-4 bg-base-100">
      {names.map((name) => (
        <PackageIcon
          key={name}
          name={name}
          isCask={name !== 'wget' && name !== 'ffmpeg' && name !== 'imagemagick'}
          className="size-10"
        />
      ))}
    </div>
  )
}

export const Gallery: Story = {
  render: () => <Grid />,
}
