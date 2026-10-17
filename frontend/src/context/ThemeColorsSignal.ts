import { signal, type Signal } from '@preact/signals'

export interface ThemeColors {
  base100: string
  base300: string
  baseContent: string
  primary: string
  primaryContent: string
  success: string
  successContent: string
}

// Reads the app's current daisyUI theme colors straight from the resolved
// CSS custom properties on <html> (see style.css: only a light/dark pair,
// switched automatically by prefers-color-scheme -- there's no in-app theme
// toggle to hook into) so the graph's node/edge colors always match the rest
// of the UI instead of a hardcoded palette that would look wrong in dark
// mode.
function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim()
    return v || fallback
  }
  return {
    base100: get('--color-base-100', '#ffffff'),
    base300: get('--color-base-300', '#d4d4d4'),
    baseContent: get('--color-base-content', '#1f2937'),
    primary: get('--color-primary', '#4f46e5'),
    primaryContent: get('--color-primary-content', '#ffffff'),
    success: get('--color-success', '#22c55e'),
    successContent: get('--color-success-content', '#052e12'),
  }
}

let colors: Signal<ThemeColors> | null = null

/**
 * The current theme colors as a signal, created on first use (so nothing
 * reads the DOM at import time) and updated whenever the system switches
 * between light and dark.
 */
export function themeColorsSignal(): Signal<ThemeColors> {
  if (colors) return colors
  const created = signal(readThemeColors())
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => (created.value = readThemeColors()))
  colors = created
  return created
}
