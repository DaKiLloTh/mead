import type { Meta, StoryObj } from '@storybook/preact-vite'
import { useState } from 'preact/hooks'
import { installWailsMocks } from '@dakilloth/storybook-wails-mock'
import PackageDetailModal from './PackageDetailModal'
import { fakePackage, defaultGoMocks } from '../../.storybook/mocks/wailsApi'

interface StoryArgs {
  name: string
  isCask: boolean
  installed: boolean
  outdated: boolean
  homepage: string
  license: string
  version: string
  installedVersion: string
  dependencies: string
  conflictsWith: string
  caveats: string
  deprecated: boolean
  pinned: boolean
  linked: boolean
  kegOnly: boolean
  autoUpdates: boolean
}

const csv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

// PackageDetailModal has far more visual states than name/isCask alone can
// reach -- the earlier version of this story only controlled those two,
// because everything else the component renders (homepage vs GitHub-
// releases link, license, dependencies, deprecated/pinned/linked/kegOnly,
// caveats...) came from api.getInfo(), which was mocked to always return
// the same fakePackage() defaults regardless of args. Reconfiguring the
// GetInfo mock's response on every render, from the rest of these args,
// is what actually makes those states reachable from Controls -- spreading
// defaultGoMocks back in so the other App methods (Uses, DepsGraph, ...)
// stay mocked too, since installWailsMocks replaces window.go wholesale
// rather than merging.
function Modal(args: StoryArgs) {
  const [open, setOpen] = useState(true)

  installWailsMocks({
    go: {
      ...defaultGoMocks,
      'app.App.GetInfo': () =>
        fakePackage(args.name, args.isCask, {
          installed: args.installed,
          outdated: args.outdated,
          homepage: args.homepage,
          license: args.license,
          version: args.version,
          installedVersion: args.installedVersion,
          dependencies: csv(args.dependencies),
          conflictsWith: csv(args.conflictsWith),
          caveats: args.caveats,
          deprecated: args.deprecated,
          pinned: args.pinned,
          linked: args.linked,
          kegOnly: args.kegOnly,
          autoUpdates: args.autoUpdates,
        }),
    },
  })

  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        Reopen
      </button>
    )
  }
  return (
    <PackageDetailModal
      target={{ name: args.name, isCask: args.isCask }}
      onClose={() => setOpen(false)}
      onChanged={() => {}}
    />
  )
}

const meta: Meta<StoryArgs> = {
  title: 'Components/PackageDetailModal',
  argTypes: {
    name: { control: 'text' },
    isCask: { control: 'boolean' },
    installed: { control: 'boolean' },
    outdated: { control: 'boolean' },
    homepage: { control: 'text', description: 'A github.com/<owner>/<repo> URL switches Homepage → Release notes' },
    license: { control: 'text' },
    version: { control: 'text' },
    installedVersion: { control: 'text' },
    dependencies: { control: 'text', description: 'Comma-separated' },
    conflictsWith: { control: 'text', description: 'Comma-separated' },
    caveats: { control: 'text' },
    deprecated: { control: 'boolean' },
    pinned: { control: 'boolean' },
    linked: { control: 'boolean' },
    kegOnly: { control: 'boolean' },
    autoUpdates: { control: 'boolean' },
  },
  args: {
    name: 'wget',
    isCask: false,
    installed: true,
    outdated: false,
    homepage: 'https://www.gnu.org/software/wget/',
    license: 'MIT',
    version: '1.25.0',
    installedVersion: '1.25.0',
    dependencies: 'openssl@3, readline',
    conflictsWith: '',
    caveats: '',
    deprecated: false,
    pinned: false,
    linked: true,
    kegOnly: false,
    autoUpdates: false,
  },
  // Keyed by every arg that changes the mocked package, not just name/isCask
  // -- a plain re-render (no remount) would leave PackageDetailModal's
  // already-fetched `pkg` state stale, since it only re-fetches when
  // target's name/isCask identity changes, not when the mock's response
  // shape does.
  render: (args) => <Modal key={JSON.stringify(args)} {...args} />,
}
export default meta

type Story = StoryObj<StoryArgs>

export const Formula: Story = {}

export const Cask: Story = {
  args: {
    name: 'visual-studio-code',
    isCask: true,
    homepage: 'https://code.visualstudio.com/',
    dependencies: '',
    autoUpdates: true,
  },
}

export const ReleaseNotesFromGitHub: Story = {
  args: { homepage: 'https://github.com/homebrew/homebrew-core' },
}

export const NotInstalled: Story = {
  args: { installed: false, linked: false },
}

export const OutdatedAndPinned: Story = {
  args: { outdated: true, pinned: true, version: '1.26.0' },
}

export const DeprecatedUnlinkedKegOnly: Story = {
  args: { deprecated: true, linked: false, kegOnly: true },
}

export const WithCaveatsAndConflicts: Story = {
  args: {
    caveats:
      'This formula has an optional dependency on gnutls for TLS support.\nBash completion has been installed to...',
    conflictsWith: 'curl',
  },
}
