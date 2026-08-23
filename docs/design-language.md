# mead design language

This document captures the visual identity adopted in the "honey/mead visual
identity" pass (GitHub issue #95). It is a first pass, not a finished spec:
the owner asked for a real attempt to react to, and expects follow-up rounds
after actually looking at it. Treat the values below as the current state,
not as permanently fixed.

It exists for two reasons: it is the reference for a marketing site planned
separately (issue #96, which wants to reuse this identity once it settles),
and it is the reference for anyone extending the mead UI later, so the
identity does not drift one component at a time.

## Direction

Honey, mead, and bar tones specifically: honey amber, aged wood, glass,
taproom warmth. Not a generic warm/earthy palette, the actual drink and the
setting it is served in.

## Color tokens

Source of truth: the design handoff at
`design_handoff_mead_icons/README.md` (already used for the app icon in
#87). The values below are exactly those tokens, mapped onto daisyUI 5's
theme slots in `frontend/src/style.css`.

### Base tokens (from the handoff)

| Token | Light | Dark |
|---|---|---|
| Accent (honey amber) | `#D4A24C` | `#D4A24C` |
| Accent dark | `#8B6224` | `#8B6224` |
| Accent darker | `#6B4B1B` | `#6B4B1B` |
| Accent soft / cream | `#F6E7CC` | `#F6E7CC` |
| Success green | `#4E9B6E` | `#4E9B6E` |
| Error red | `#C1503D` | `#C1503D` |
| Background | `#F7F1E6` | `#17130F` |
| Card | `#FFFFFF` | `#211B15` |
| Border | `#E9E0CE` | `#3A3126` |
| Text | `#241C13` | `#F3EADA` |
| Muted text | `#847A67` | `#AFA28A` |

The accent/success/error tones are the same hex values in both themes (the
handoff only gives one value for each); only the base surface and text
tokens differ between light and dark.

### daisyUI slot mapping

Defined as two custom daisyUI 5 themes (`light`, `dark`) via
`@plugin "daisyui/theme"` blocks in `frontend/src/style.css`, replacing
daisyUI's built-in `light`/`dark` themes entirely.

| daisyUI slot | Light value | Dark value | Reasoning |
|---|---|---|---|
| `base-100` | `#F7F1E6` | `#17130F` | Page background (handoff's `bg` token). |
| `base-200` | `#FFFFFF` | `#211B15` | Card/panel surface (handoff's `card` token). Lighter than `base-100` in both themes, matching how the app already renders the sidebar and cards as a translucent panel floating over the page (see `Sidebar.tsx`'s `bg-base-200/70` backdrop blur): a bright glass panel over a warmer floor in light mode, a warm-lit panel over a near-black floor in dark mode. |
| `base-300` | `#E9E0CE` | `#3A3126` | Borders/dividers (handoff's `border` token). |
| `base-content` | `#241C13` | `#F3EADA` | Body text (handoff's `text` token). |
| `primary` | `#D4A24C` | `#D4A24C` | The honey amber accent itself, the drink's own color, so it's the app's main interactive color (primary buttons, active states, links). |
| `primary-content` | `#241C13` | `#17130F` | Text/icon color on top of primary-colored surfaces. White-on-amber measures roughly 2.3:1 contrast (fails WCAG AA); the theme's own dark text/background color measures 7:1+ against the same amber, so dark text was used instead of white. |
| `secondary` | `#8B6224` | `#8B6224` | Accent dark: a deeper amber/bronze, aged wood. Used for a secondary emphasis level below primary. |
| `secondary-content` | `#F6E7CC` | `#F6E7CC` | Cream, contrast-checked against `#8B6224` (~4.45:1). |
| `accent` (daisyUI's third slot, distinct from "the accent amber" token) | `#6B4B1B` | `#6B4B1B` | Accent darker: a deeper wood tone, chosen so daisyUI's `accent` reads as visibly different from `primary` rather than a lighter/darker copy of the same amber. Used for cask badges (`badge-accent`) versus formula badges (`badge-primary`). |
| `accent-content` | `#F6E7CC` | `#F6E7CC` | Cream, ~6.5:1 contrast against `#6B4B1B`. |
| `neutral` | `#6B4B1B` | `#6B4B1B` | Accent darker again, kept identical across both themes (mirrors how daisyUI's own built-in themes keep `neutral` constant between light and dark). Used for e.g. the active sidebar nav item background. |
| `neutral-content` | `#F6E7CC` | `#F6E7CC` | Cream. |
| `success` | `#4E9B6E` | `#4E9B6E` | Handoff's success green, unchanged. |
| `success-content` | `#241C13` | `#17130F` | The theme's own dark color; better contrast (~5:1 light, better in dark) than white on this green (~3.4:1). |
| `warning` | `#D4A24C` | `#D4A24C` | Reuses the amber accent. This matches the handoff's own `badge-outdated.svg`, which uses the accent color for its up-arrow glyph, so "warning" and "the brand's honey color" are deliberately the same thing here. |
| `warning-content` | `#241C13` | `#17130F` | Same reasoning as `primary-content`. |
| `error` | `#C1503D` | `#C1503D` | Handoff's error red, unchanged. |
| `error-content` | `#FFFFFF` | `#FFFFFF` | White, ~4.7:1 contrast against this red in both themes. |
| `info` | `#847A67` | `#AFA28A` | The handoff has no dedicated info color. This reuses the muted-text token as a background rather than inventing a new hue. `info` is rarely hit in the app today (one fallback branch in `Services.tsx` for an unrecognized service status), so a low-emphasis neutral tone was judged an acceptable stand-in for a first pass. |
| `info-content` | `#241C13` | `#17130F` | The theme's own dark color. |

Radius/size/border/depth/noise values were left at daisyUI's stock
defaults (`--radius-selector: 0.5rem`, `--radius-field: 0.25rem`,
`--radius-box: 0.5rem`, `--size-selector: 0.25rem`, `--size-field: 0.25rem`,
`--border: 1px`, `--depth: 1`, `--noise: 0`) in both themes, so this pass is
a color and typography change only, not a shape change.

Muted text in body copy still uses opacity modifiers on `base-content`
(e.g. `text-base-content/70`, `/50`) rather than a dedicated muted color
token, which is how the app already worked before this pass and remains
the pattern to use going forward.

## Typography

- **Instrument Serif (italic)**: used only for the "mead" wordmark in the
  sidebar (`frontend/src/components/Sidebar.tsx`, the `nav.brand` i18n
  key), via the `.font-wordmark` CSS class defined in
  `frontend/src/style.css`. Not used anywhere else in the UI.
- **Manrope**: the general UI font, applied globally via `body`'s
  `font-family` in `frontend/src/style.css`. Covers every other piece of
  text in the app.

Both are loaded from local font files vendored into the repo under
`frontend/src/assets/fonts/` (`manrope-400.woff2`, `manrope-500.woff2`,
`manrope-600.woff2`, `manrope-700.woff2`, `instrument-serif-italic.woff2`),
declared via `@font-face` in `frontend/src/style.css`, rather than fetched
from Google Fonts at runtime. This is a native desktop app that should
look the same fully offline. The files came from the `@fontsource/manrope`
and `@fontsource/instrument-serif` npm packages (SIL Open Font License),
used only to extract the actual font files during this pass; they are not
runtime dependencies of the app. The four Manrope weights vendored match
the font-weight utility classes actually used in the codebase today
(`font-medium`/500, `font-semibold`/600, `font-bold`/700, plus the
default 400); add a new weight's `.woff2` file and `@font-face` block if a
future change needs one that isn't already vendored.

## Icon set

Source: `design_handoff_mead_icons/icons/*.svg` (see the handoff's
`README.md`), recreated as React SVG components in
`frontend/src/components/Icons.tsx`.

### Integrated

- **Toolbar action glyphs** (`toolbar-install.svg`, `toolbar-update.svg`,
  `toolbar-remove.svg`, `toolbar-search.svg`, `toolbar-refresh.svg`):
  redrawn as the existing `DownloadIcon`, `ArrowUpCircleIcon`, `TrashIcon`,
  `SearchIcon`, and `RefreshIcon` components respectively, on the
  handoff's native 32x32 grid, using `currentColor`/`fill:none` instead of
  the handoff's fixed amber. These five icon components were already used
  everywhere across the app (install/export buttons, uninstall/clear
  buttons, upgrade buttons, search fields, refresh/reinstall/link
  buttons in `Dashboard.tsx`, `Installed.tsx`, `Search.tsx`,
  `PackageDetailModal.tsx`, `Settings.tsx`, `Maintenance.tsx`,
  `AppStore.tsx`, `Updates.tsx`, `Services.tsx`, `History.tsx`,
  `Collections.tsx`, `Adopt.tsx`, `CommandPalette.tsx`,
  `DependencyGraph.tsx`), so redrawing their internals in place updates
  every one of those call sites at once, rather than adding five unused
  duplicates. Kept on `currentColor` so buttons that use a non-default
  color (e.g. an error-colored uninstall button) keep working correctly.
- **Status badge glyphs** (`badge-installed.svg`, `badge-outdated.svg`,
  `badge-broken.svg`): added as new components `BadgeInstalledIcon`,
  `BadgeOutdatedIcon`, `BadgeBrokenIcon`, self-colored circles matching
  the handoff exactly (not `currentColor`, since these are small
  illustrations rather than monochrome glyphs). Placed as a small leading
  icon inside the existing text badge pills, not replacing them:
  - `BadgeInstalledIcon` next to the "installed" badge in
    `frontend/src/views/Search.tsx` and
    `frontend/src/components/PackageDetailModal.tsx`.
  - `BadgeOutdatedIcon` next to the "outdated" badge in
    `frontend/src/views/Installed.tsx` and
    `frontend/src/components/PackageDetailModal.tsx`.
  - `BadgeBrokenIcon` next to the "deprecated" badge in
    `frontend/src/components/PackageDetailModal.tsx`. The app has no
    separate "broken package" concept; a package flagged deprecated
    upstream is the closest existing match for the handoff's red
    exclamation glyph, so that mapping was used rather than leaving the
    icon unused.

### Added but not wired in (left unused, on purpose)

- **`SidebarFormulasIcon`, `SidebarCasksIcon`, `SidebarTapsIcon`,
  `SidebarServicesIcon`** (from `sidebar-formulas.svg`,
  `sidebar-casks.svg`, `sidebar-taps.svg`, `sidebar-services.svg`): every
  item in `Sidebar.tsx`'s nav list renders the same `size-4` (16px)
  `currentColor` line icon today. `sidebar-taps` and `sidebar-services`
  have an exact 1:1 nav item to attach to, but swapping only 2 of the
  sidebar's 13 items to filled 26px amber tiles (while the rest stay
  16px monochrome line icons) would read as inconsistent rather than
  intentional, not a "minimal, non-disruptive" integration. `formulas`
  and `casks` don't even have a 1:1 nav item to begin with, since the
  sidebar's "Installed" entry already covers both formulae and casks
  together. All four are kept in `Icons.tsx` for a future pass that
  redoes the whole nav icon set as tiles, or a different call site.
- **`PackagePlaceholderIcon`** (from `package-placeholder.svg`): not
  wired into `PackageIcon.tsx`'s fallback. That fallback currently shows
  a deterministic colored monogram (`frontend/src/lib/monogram.ts`,
  unit-tested), which gives every formula (formulae never have icons at
  all) and every cask with a failed icon extraction a distinct color and
  letter. Replacing that with one identical gray box for every fallback
  case would be a real usability regression across list-heavy views like
  Installed (which can show 100+ formulae at once), not just a style
  change. Kept available in case a future "true unknown icon" state
  (distinct from "this package category never has icons") gets added.

## How to stay consistent

When adding a new UI element in this identity:

- **Color**: reach for a daisyUI semantic class (`bg-primary`,
  `text-base-content`, `badge-success`, etc), never a raw hex value.
  Every slot is themed via the tokens above and updates automatically for
  light/dark. If an existing slot doesn't fit, don't invent a new color;
  either reuse the closest token from the "Base tokens" table above, or
  raise it as a deliberate new mapping decision (and update this doc).
- **Font**: plain UI text needs no explicit font class (Manrope is the
  `body` default). Only use `.font-wordmark` for the literal "mead"
  wordmark itself, nowhere else.
- **Icons**: add new icons to `frontend/src/components/Icons.tsx`
  following the existing patterns there:
  - A monochrome UI glyph (the common case): spread the shared `base`
    (24x24 viewBox) or `toolbar32` (32x32 viewBox) constant and use
    `currentColor`, so it inherits whatever text/button color it's
    placed in.
  - A small self-colored illustration (a tinted tile or status circle,
    matching the handoff's sidebar-*/badge-* style): use fixed hex
    values from the "Base tokens" table above, not `currentColor`, and
    say in a comment which handoff token each fill/stroke came from.
  - If a handoff icon doesn't have a genuine, non-disruptive call site,
    add it to `Icons.tsx` anyway (so it's discoverable and ready) but
    leave it unused, with a comment explaining why, rather than forcing
    it into a mismatched spot.
- **Contrast**: when pairing a color with text/icon color on top of it
  (a new badge variant, a new button style), check contrast against both
  candidate content colors (the theme's own dark text/bg color, and
  cream/white) the way the mapping table above does, and prefer whichever
  clears WCAG AA (4.5:1 for normal text, 3:1 for large text/UI
  components) rather than defaulting to white.
