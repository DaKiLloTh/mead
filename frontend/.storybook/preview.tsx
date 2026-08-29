import type { Preview } from '@storybook/preact-vite'
import '../src/style.css'
import { initI18n } from '../src/i18n'

// Real i18next initialization (not mocked, unlike the context providers in
// mocks/) -- translated copy is exactly the kind of thing worth seeing for
// real while developing/reviewing a component, and initI18n() has no
// Wails dependency (it falls back to browser-based language detection when
// the Go backend's systemLocale() call isn't available, exactly this
// case). A Storybook loader runs once before each story renders, so every
// story can assume i18next is ready without needing its own boilerplate.
const preview: Preview = {
  loaders: [async () => ({ i18nReady: await initI18n() })],
}

export default preview
