import type { SVGAttributes } from 'preact'

type IconProps = SVGAttributes<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

// Toolbar action glyphs (install/update/remove/search/refresh) below are
// redrawn from the mead visual identity handoff's toolbar-*.svg files (see
// GitHub issue #95), on the handoff's native 32x32 grid. They keep
// currentColor/fill:none so every existing call site (buttons across
// Installed/Search/Dashboard/PackageDetailModal/etc, not just a literal
// toolbar) keeps inheriting its own button color instead of being locked
// to the handoff's reference amber.

const toolbar32 = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 32 32',
}

export function DownloadIcon(p: IconProps) {
  return (
    <svg {...toolbar32} {...p}>
      <path d="M16 5 V20" strokeWidth={2.5} />
      <path d="M10 15 L16 21 L22 15" strokeWidth={2.5} />
      <path d="M6 25 H26" strokeWidth={2.5} />
    </svg>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...toolbar32} {...p}>
      <path d="M9 11 H23" strokeWidth={2.2} />
      <path d="M12 11 V8.5 C12 7.7 12.7 7 13.5 7 H18.5 C19.3 7 20 7.7 20 8.5 V11" strokeWidth={2.2} />
      <path d="M11 11 L12 24 C12 24.8 12.7 25.5 13.5 25.5 H18.5 C19.3 25.5 20 24.8 20 24 L21 11" strokeWidth={2.2} />
      <path d="M14.5 15 V21" strokeWidth={2} />
      <path d="M17.5 15 V21" strokeWidth={2} />
    </svg>
  )
}

export function ArrowUpCircleIcon(p: IconProps) {
  return (
    <svg {...toolbar32} {...p}>
      <circle cx="16" cy="16" r="11" strokeWidth={2.2} />
      <path d="M16 21 V11" strokeWidth={2.2} />
      <path d="M11 15 L16 10 L21 15" strokeWidth={2.2} />
    </svg>
  )
}

export function PinIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
      <path d="M12 15v5" />
    </svg>
  )
}

export function PlayIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M7 4l13 8-13 8V4z" />
    </svg>
  )
}

export function SquareIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  )
}

export function RefreshIcon(p: IconProps) {
  return (
    <svg {...toolbar32} {...p}>
      <path d="M8 12 A9 9 0 0 1 24 9" strokeWidth={2.2} />
      <path d="M21 6 L24 9 L20.5 11.5" strokeWidth={2.2} />
      <path d="M24 20 A9 9 0 0 1 8 23" strokeWidth={2.2} />
      <path d="M11 26 L8 23 L11.5 20.5" strokeWidth={2.2} />
    </svg>
  )
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...toolbar32} {...p}>
      <circle cx="14" cy="14" r="8" strokeWidth={2.4} />
      <path d="M20 20 L26 26" strokeWidth={2.4} />
    </svg>
  )
}

export function DashboardIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="4" rx="1" />
      <rect x="13" y="11" width="7" height="9" rx="1" />
      <rect x="4" y="14" width="7" height="6" rx="1" />
    </svg>
  )
}

export function PackageIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4.5 7.5L12 12l7.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  )
}

export function LayersIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  )
}

export function WrenchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14.5 6.5a4 4 0 015 5L21 14l-3 3-2.5-1.5a4 4 0 01-5-5L4 4" />
      <path d="M4 20l6-6" />
    </svg>
  )
}

export function TapIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v6" />
      <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
      <path d="M12 9c-3 4-5 6.5-5 9a5 5 0 0010 0c0-2.5-2-5-5-9z" />
    </svg>
  )
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ExternalLinkIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h6" />
    </svg>
  )
}

export function XIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12l5 5 9-9" />
    </svg>
  )
}

export function BeakerIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5.5 9a1.5 1.5 0 001.3 2.3h12.4a1.5 1.5 0 001.3-2.3L14 9V3" />
      <path d="M7 15h10" />
    </svg>
  )
}

export function ServerIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="7" rx="1" />
      <rect x="3" y="13" width="18" height="7" rx="1" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  )
}

export function StarIcon(p: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = p
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} {...rest}>
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6L12 3z" />
    </svg>
  )
}

export function TagIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3h6a1 1 0 011 1v6l-9 9-7-7 9-9z" />
      <circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShieldIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  )
}

export function FingerprintIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  )
}

export function ClockIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function GridIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function ImportIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <rect x="4" y="17" width="16" height="4" rx="1" />
    </svg>
  )
}

export function StoreIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 8l1.5-4h13L20 8" />
      <path d="M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z" />
      <path d="M9 8v2a3 3 0 006 0V8" />
    </svg>
  )
}

export function MaximizeIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M8 3H4v4" />
      <path d="M16 3h4v4" />
      <path d="M8 21H4v-4" />
      <path d="M16 21h4v-4" />
    </svg>
  )
}

export function CopyIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a1 1 0 011-1h10" />
    </svg>
  )
}

export function AlertIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function AppWindowIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6.5" cy="6.5" r="0.4" fill="currentColor" stroke="currentColor" />
      <circle cx="9" cy="6.5" r="0.4" fill="currentColor" stroke="currentColor" />
    </svg>
  )
}

export function GearIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

// Status badge glyphs below are redrawn from the mead visual identity
// handoff's badge-*.svg files (see GitHub issue #95): a small self-colored
// circle with a white glyph, meant to sit alongside the app's existing
// text badge-* pills (badge-outline/badge-warning/etc), not replace them.
// badge-broken (a red exclamation) is used for the "deprecated" state --
// the app has no separate "broken package" concept, and a deprecated
// formula/cask flagged upstream is the closest existing match for it.

export function BadgeInstalledIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="12" fill="#4E9B6E" />
      <path
        d="M6 12.5 L10 16.5 L18 8"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function BadgeOutdatedIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="12" fill="#D4A24C" />
      <path d="M12 17 V7" stroke="white" strokeWidth={2.4} strokeLinecap="round" />
      <path
        d="M7 12 L12 7 L17 12"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function BadgeBrokenIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="12" fill="#C1503D" />
      <line x1="12" y1="6" x2="12" y2="14" stroke="white" strokeWidth={2.6} strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.4" fill="white" />
    </svg>
  )
}
