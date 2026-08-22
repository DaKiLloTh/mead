import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

export function DownloadIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v12" />
      <path d="M6 11l6 6 6-6" />
      <path d="M4 21h16" />
    </svg>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function ArrowUpCircleIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8" />
      <path d="M8.5 11.5L12 8l3.5 3.5" />
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
    <svg {...base} {...p}>
      <path d="M20 11a8 8 0 10-2.6 6.2" />
      <path d="M20 4v7h-7" />
    </svg>
  )
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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

export function SunIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}

export function MoonIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
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

export function TerminalIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  )
}
