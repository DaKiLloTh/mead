import { useEffect, useState } from 'react'

const SIZES = [
  { key: 'sm', label: 'Small', scale: '14px' },
  { key: 'md', label: 'Default', scale: '16px' },
  { key: 'lg', label: 'Large', scale: '18px' },
  { key: 'xl', label: 'Extra large', scale: '20px' },
] as const

type SizeKey = (typeof SIZES)[number]['key']

function getInitialSize(): SizeKey {
  const stored = localStorage.getItem('textSize') as SizeKey | null
  return stored && SIZES.some((s) => s.key === stored) ? stored : 'md'
}

export default function SettingsMenu() {
  const [size, setSize] = useState<SizeKey>(getInitialSize)

  useEffect(() => {
    const found = SIZES.find((s) => s.key === size) ?? SIZES[1]
    document.documentElement.style.fontSize = found.scale
    localStorage.setItem('textSize', size)
  }, [size])

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-sm btn-circle" aria-label="Settings">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </div>
      <div tabIndex={-1} className="dropdown-content menu bg-base-100 rounded-box z-10 w-56 p-3 shadow border border-base-300">
        <div className="text-xs font-medium uppercase text-base-content/50 mb-2">Text size</div>
        <div className="join w-full">
          {SIZES.map((s) => (
            <button
              key={s.key}
              className={`btn btn-xs join-item flex-1 ${size === s.key ? 'btn-primary' : ''}`}
              onClick={() => setSize(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
