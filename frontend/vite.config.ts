/// <reference types="vitest/config" />
import {defineConfig} from 'vite'
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
    include: ['src/**/*.test.ts'],
  },
})
