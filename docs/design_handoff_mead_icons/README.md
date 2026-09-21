# Handoff: mead Icon Set

## Overview
Icon set for **mead**, a macOS GUI package manager (lowercase branding). Covers the app icon, toolbar actions, sidebar categories, status badges, and a generic package placeholder.

## About the Design Files
The SVGs in `icons/` are **design references**, built as an HTML prototype (`mead Icon Set.dc.html`, included for visual context only — not for shipping). Recreate/integrate these as native asset catalog icons (`.icns`, SF Symbol-style template images, or SwiftUI `Image`/`Label` icons) in the target codebase, following its existing icon conventions.

## Fidelity
High-fidelity. Colors, shapes, and proportions below are final.

## Icons

### App Icon (`app-icon.svg`, 512×512 viewBox 0 0 100 100)
Squircle (corner radius 22% of width) with a diagonal gradient background (`#D4A24C` → `#8B6224`), containing a cream-colored stein/tankard glass (`#F6E7CC` fill, `#6B4B1B` 2.5px stroke), amber liquid fill (`#8B6224`), foam ellipse at rim, and a slim D-shaped handle (`#6B4B1B`, 3.5px stroke) on the right side, positioned mid-upper height to clear the foam.
- Export at 16/32/64/128/256/512 for `.icns`.

### Toolbar Actions (24–26px glyphs, 2.2–2.5px stroke, `#D4A24C`, stroke-only/no fill)
- `toolbar-install.svg` — down arrow into a tray (install a package)
- `toolbar-update.svg` — up arrow inside a circle (upgrade one package)
- `toolbar-remove.svg` — trash can (uninstall)
- `toolbar-search.svg` — magnifying glass
- `toolbar-refresh.svg` — circular sync arrows (refresh all)

Intended at 56×56px button targets (44px+ hit area) in a toolbar.

### Sidebar Categories (32×32, rounded-square tinted tile, `#D4A24C` background, white glyph)
- `sidebar-formulas.svg` — hexagon (honeycomb cell)
- `sidebar-casks.svg` — barrel outline
- `sidebar-taps.svg` — faucet + drip
- `sidebar-services.svg` — gear/cog

Used at ~26×26px next to a 14px sidebar label.

### Status Badges (24×24 circle, white glyph)
- `badge-installed.svg` — green `#4E9B6E`, checkmark
- `badge-outdated.svg` — accent `#D4A24C`, up arrow
- `badge-broken.svg` — red `#C1503D`, exclamation

Used at ~18px trailing a package row.

### Package Placeholder (`package-placeholder.svg`, 32×32)
Isometric open-box outline, neutral gray `#847A67`, 1.8px stroke. Generic fallback when no specific icon is available.

## Design Tokens
- Accent (honey amber): `#D4A24C` — tweakable, this is the default
- Accent dark: `#8B6224`
- Accent darker: `#6B4B1B`
- Accent soft/cream: `#F6E7CC`
- Success green: `#4E9B6E`
- Error red: `#C1503D`
- Light bg: `#F7F1E6` / card `#FFFFFF` / border `#E9E0CE` / text `#241C13` / muted text `#847A67`
- Dark bg: `#17130F` / card `#211B15` / border `#3A3126` / text `#F3EADA` / muted text `#AFA28A`
- Display font: Instrument Serif (italic) for the "mead" wordmark; Manrope for all UI text

## Assets
All icons are hand-drawn inline SVG, no external image assets.

## Files
- `icons/*.svg` — 14 standalone icon files listed above
- `mead Icon Set.dc.html` — full interactive reference sheet (light/dark toggle, accent color tweak)
