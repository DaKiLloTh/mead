// Pure logic for which nav items a platform's capabilities allow, shared by
// Sidebar.tsx (the actual nav list) and CommandPalette.tsx (Cmd+K's nav
// results), so the two can never disagree about what's navigable on the
// current platform.
//
// Milestone 1 of issue #105 only gates what's cheap and unambiguous: App
// Store (mas has zero Linux meaning) and Adopt (scanning a single
// conventional Applications directory has zero Linux meaning, see
// internal/platform's HasAppAdoption doc comment). Everything else stays
// visible regardless of capabilities for now -- see docs/cross-platform-
// architecture.md and the milestone 1 PR description for what's
// deliberately left ungated (Security's Gatekeeper-specific sub-tabs, the
// zap/appdir cask settings).

import type { Capabilities } from './api'
import type { ViewKey } from '../components/Sidebar'

/** Maps a nav item's ViewKey to the capability that must be true for it to appear, for items that are ever gated at all. */
const requiredCapability: Partial<Record<ViewKey, keyof Capabilities>> = {
  appstore: 'hasAppStore',
  adopt: 'hasAppAdoption',
}

/** True if this nav item should be shown given the platform's capabilities. Ungated items are always visible. */
export function isNavItemVisible(key: ViewKey, capabilities: Capabilities): boolean {
  const required = requiredCapability[key]
  return required === undefined || capabilities[required]
}

/** Filters a list of nav-item-shaped objects down to the ones this platform's capabilities allow. */
export function visibleNavItems<T extends { key: ViewKey }>(items: T[], capabilities: Capabilities): T[] {
  return items.filter((item) => isNavItemVisible(item.key, capabilities))
}

// --- Command palette shortcut (Cmd+K / Ctrl+K), issue #192 ---
//
// CommandPalette.tsx's keydown handler and App.tsx's keycap hint both
// assumed e.metaKey/"⌘" unconditionally, so the shortcut didn't exist on
// Linux at all (there's no Cmd key) and the hint shown was simply wrong.
// Pulled out as pure functions, same reasoning as the rest of this file:
// testable without rendering either component, and App.tsx/CommandPalette.tsx
// can't disagree about what the modifier is since they both call the same
// function.

/** True when e carries this platform's primary shortcut modifier: Cmd on macOS, Ctrl elsewhere. */
export function isPrimaryShortcutModifierPressed(
  e: { metaKey: boolean; ctrlKey: boolean },
  capabilities: Capabilities
): boolean {
  return capabilities.hasCmdModifierKey ? e.metaKey : e.ctrlKey
}

/** The keycap label for the primary shortcut modifier, for a hint like "⌘ K" / "Ctrl K". */
export function primaryShortcutModifierLabel(capabilities: Capabilities): string {
  return capabilities.hasCmdModifierKey ? '⌘' : 'Ctrl'
}
