// Default window.go mocks for App's Wails-bound methods, installed once in
// preview.tsx via storybook-wails-mock's installWailsMocks. Deterministic,
// no network -- CaskIcon/MasAppIcon resolve empty so PackageIcon always
// falls back to its monogram tile rather than depending on real icon
// extraction, which doesn't exist outside the Wails runtime anyway.
import type { brew } from '../../wailsjs/go/models'

export function fakePackage(
  name: string,
  isCask: boolean,
  overrides: Partial<brew.BrewPackage> = {}
): brew.BrewPackage {
  return {
    name,
    fullName: name,
    isCask,
    tap: isCask ? 'homebrew/cask' : 'homebrew/core',
    desc: `A fake ${isCask ? 'cask' : 'formula'} used for Storybook.`,
    homepage: 'https://example.com',
    license: 'MIT',
    version: '1.2.3',
    installedVersion: '1.2.3',
    installed: true,
    outdated: false,
    pinned: false,
    deprecated: false,
    disabled: false,
    kegOnly: false,
    caveats: '',
    dependencies: isCask ? [] : ['openssl@3', 'readline'],
    installedOnRequest: true,
    installedAsDependency: false,
    autoUpdates: false,
    artifacts: isCask ? [`${name}.app`] : [],
    appPaths: [],
    linked: true,
    conflictsWith: [],
    zapTrashPaths: [],
    ...overrides,
  } as brew.BrewPackage
}

export const defaultGoMocks: Record<string, (...args: unknown[]) => unknown> = {
  'app.App.GetInfo': (...args: unknown[]) => {
    const [name, isCask] = args as [string, boolean]
    return fakePackage(name, isCask)
  },
  'app.App.Uses': () => [],
  'app.App.DepsGraph': (...args: unknown[]) => {
    const [name] = args as [string]
    return {
      root: name,
      nodes: [
        { name, isCask: false },
        { name: 'openssl@3', isCask: false },
        { name: 'readline', isCask: false },
      ],
      edges: [
        { from: name, to: 'openssl@3' },
        { from: name, to: 'readline' },
      ],
    }
  },
  'app.App.CaskIcon': () => '',
  'app.App.MasAppIcon': () => '',
  'app.App.GistLogs': () => 'https://gist.github.com/example/story-fixture',
  'app.App.ExportDependencyGraphPNG': () => undefined,
}
