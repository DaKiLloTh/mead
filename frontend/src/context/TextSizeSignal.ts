import { effect, signal } from '@preact/signals'

export const SIZES = [
  { key: 'sm', labelKey: 'settings.sizeSmall', scale: '14px' },
  { key: 'md', labelKey: 'settings.sizeDefault', scale: '16px' },
  { key: 'lg', labelKey: 'settings.sizeLarge', scale: '18px' },
  { key: 'xl', labelKey: 'settings.sizeExtraLarge', scale: '20px' },
] as const

export type SizeKey = (typeof SIZES)[number]['key']

const STORAGE_KEY = 'textSize'

/** A stored value if it names a real size, otherwise the default. */
export function parseTextSize(stored: string | null): SizeKey {
  return SIZES.find((s) => s.key === stored)?.key ?? 'md'
}

export function scaleFor(size: SizeKey): string {
  return (SIZES.find((s) => s.key === size) ?? SIZES[1]).scale
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The app-wide text size. Settings writes it; startTextSize applies it. */
export const textSizeSignal = signal<SizeKey>(parseTextSize(readStored()))

let started = false

/**
 * Applies the text size to <html> and saves it, now and on every change.
 * Called once from App on mount, so a saved size takes effect at launch
 * rather than only once Settings has been opened.
 */
export function startTextSize() {
  if (started) return
  started = true
  effect(() => {
    const size = textSizeSignal.value
    document.documentElement.style.fontSize = scaleFor(size)
    try {
      localStorage.setItem(STORAGE_KEY, size)
    } catch {
      // Storage can be unavailable; the size still applies for this session.
    }
  })
}
