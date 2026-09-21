import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// @preact/preset-vite aliases react/react-dom imports to preact/compat and
// swaps the JSX runtime to Preact's, so existing React-authored components
// (including third-party ones: react-i18next, react-cytoscapejs) keep
// working unmodified. See PR description for what did and didn't need
// changes under this swap.
export default defineConfig({
  plugins: [preact(), tailwindcss()],
  test: {
    environment: 'node',
    // .tsx here is for component-rendering tests (e.g. Search.test.tsx),
    // which opt into a DOM environment per-file via a
    // `// @vitest-environment happy-dom` pragma comment rather than
    // switching this default -- everything else stays on the fast `node`
    // environment, since pure-logic tests (the overwhelming majority)
    // don't need a DOM at all.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `npm run coverage`. Report-only, no thresholds: run it before opening a
    // PR and read the rows for the files you changed. Stories are left out
    // because Storybook is their test.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx', 'src/**/*.d.ts', 'src/main.tsx'],
      reporter: ['text', 'html'],
    },
  },
})
