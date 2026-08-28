import { render } from 'preact'
import './style.css'
import App from './App'
import { initI18n } from './i18n'

const container = document.getElementById('root')!

// Render only once i18next has resolved an initial language (see
// i18n/index.ts for the detection order) -- .finally() means a render still
// happens even in the unexpected case that initialization itself rejects,
// rather than leaving the window blank.
void initI18n().finally(() => {
  render(<App />, container)
})
