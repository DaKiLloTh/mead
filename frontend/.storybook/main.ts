import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { StorybookConfig } from '@storybook/preact-vite'
import tailwindcss from '@tailwindcss/vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Redirects mead's own context providers (JobsContext/ConfirmContext/
// UserDataContext) to inert Storybook stand-ins (see .storybook/mocks/) --
// the real ones are backed by Wails-bound RPC calls that don't exist
// outside the actual Wails runtime, so any component rendered here that
// calls useJobs()/useConfirm()/useUserData() needs a safe default instead
// of crashing. Matched by suffix (not a full relative path) so this works
// regardless of how deeply nested the importing file is.
const contextMocks: [RegExp, string][] = [
  [/\/context\/JobsContext$/, path.resolve(dirname, 'mocks/JobsContext.tsx')],
  [/\/context\/ConfirmContext$/, path.resolve(dirname, 'mocks/ConfirmContext.tsx')],
  [/\/context\/UserDataContext$/, path.resolve(dirname, 'mocks/UserDataContext.tsx')],
]

// A plain resolve.alias entry with a RegExp `find` doesn't do what it
// looks like it does here: @rollup/plugin-alias runs a bare
// `importee.replace(find, replacement)` for regex finds, which only
// swaps the *matched substring* (just the "/context/JobsContext" suffix),
// leaving the leading "../" on the specifier and producing a mangled,
// unresolvable path. A small resolveId hook sidesteps that entirely --
// full control over what the specifier resolves to, no substring-replace
// surprises.
function contextMockPlugin(): Plugin {
  return {
    name: 'mead-storybook-context-mocks',
    enforce: 'pre',
    resolveId(source) {
      for (const [pattern, replacement] of contextMocks) {
        if (pattern.test(source)) return replacement
      }
      return null
    },
  }
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/preact-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    // Just tailwindcss() here, not @preact/preset-vite -- the
    // @storybook/preact-vite framework already configures its own Preact
    // JSX/runtime handling, and adding preset-vite's on top of it double-
    // injects Preact's runtime, breaking with "Identifier 'flushUpdates'
    // has already been declared" (confirmed by removing it).
    viteConfig.plugins = [contextMockPlugin(), ...(viteConfig.plugins ?? []), tailwindcss()]
    return viteConfig
  },
}

export default config
