// Deterministic "pick a colour for this package name" logic behind the
// coloured monogram fallback tile -- shown for formulae (which never have an
// .app/icon at all) and for any cask whose real icon extraction failed for
// any reason. Pure and framework-independent so it's unit-testable without
// rendering anything (see monogram.test.ts): the same name always produces
// the same tile, so a package's colour doesn't flicker across renders,
// views, or app restarts.

// A small fixed palette of hex background/foreground pairs, rather than a
// computed HSL hue, so contrast against the letter is guaranteed by
// construction instead of merely likely for an arbitrary hue.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: '#ef4444', fg: '#ffffff' }, // red
  { bg: '#f97316', fg: '#ffffff' }, // orange
  { bg: '#eab308', fg: '#1c1917' }, // yellow
  { bg: '#22c55e', fg: '#ffffff' }, // green
  { bg: '#14b8a6', fg: '#ffffff' }, // teal
  { bg: '#06b6d4', fg: '#ffffff' }, // cyan
  { bg: '#3b82f6', fg: '#ffffff' }, // blue
  { bg: '#8b5cf6', fg: '#ffffff' }, // violet
  { bg: '#d946ef', fg: '#ffffff' }, // fuchsia
  { bg: '#ec4899', fg: '#ffffff' }, // pink
]

/**
 * A small, fast, deterministic string hash (djb2 variant). Not
 * cryptographic -- just needs to spread different names across the palette
 * reasonably evenly and consistently.
 */
function hashString(s: string): number {
  let hash = 5381
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i)
  }
  return hash >>> 0
}

export interface Monogram {
  letter: string
  bg: string
  fg: string
}

/** Deterministic colored-monogram spec (letter + color pair) for a package name. */
export function monogramFor(name: string): Monogram {
  const trimmed = name.trim()
  const letter = (trimmed.charAt(0) || '?').toUpperCase()
  const swatch = PALETTE[hashString(trimmed.toLowerCase()) % PALETTE.length]
  return { letter, bg: swatch.bg, fg: swatch.fg }
}
