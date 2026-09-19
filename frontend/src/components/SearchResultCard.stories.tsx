import type { Meta, StoryObj } from '@storybook/preact-vite'
import SearchResultCard from './SearchResultCard'

const meta: Meta<typeof SearchResultCard> = {
  title: 'Components/SearchResultCard',
  component: SearchResultCard,
  argTypes: {
    result: { control: false },
    installed: { control: 'boolean' },
    busy: { control: 'boolean' },
    onOpenDetail: { control: false },
    onInstall: { control: false },
  },
  args: {
    result: {
      name: 'wget',
      isCask: false,
      desc: 'Internet file retriever',
      homepage: 'https://www.gnu.org/software/wget/',
      version: '1.25.0',
      tap: 'homebrew/core',
      deprecated: false,
      disabled: false,
      autoUpdates: false,
    },
    installed: false,
    busy: false,
  },
}
export default meta

type Story = StoryObj<typeof SearchResultCard>

export const NotInstalled: Story = {}

export const Installed: Story = {
  args: { installed: true },
}

export const InstallInProgress: Story = {
  args: { busy: true },
}

export const Cask: Story = {
  args: {
    result: {
      name: 'visual-studio-code',
      isCask: true,
      desc: 'Code editing. Redefined.',
      homepage: 'https://code.visualstudio.com/',
      version: '1.94.0',
      tap: 'homebrew/cask',
      deprecated: false,
      disabled: false,
      autoUpdates: true,
    },
  },
}

export const NonStandardTap: Story = {
  args: {
    result: {
      name: 'some-third-party-formula',
      isCask: false,
      desc: 'From a tap Homebrew itself does not vet',
      homepage: '',
      version: '0.3.1',
      tap: 'someuser/tap',
      deprecated: false,
      disabled: false,
      autoUpdates: false,
    },
  },
}

export const DeprecatedAndDisabled: Story = {
  args: {
    result: {
      name: 'old-formula',
      isCask: false,
      desc: 'No longer maintained',
      homepage: '',
      version: '2.1.0',
      tap: 'homebrew/core',
      deprecated: true,
      disabled: true,
      autoUpdates: false,
    },
  },
}
