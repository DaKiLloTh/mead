import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from './Icons'

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <label className="swap swap-rotate btn btn-ghost btn-sm btn-circle">
      <input
        type="checkbox"
        checked={theme === 'dark'}
        onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
      />
      <SunIcon className="swap-off size-4" />
      <MoonIcon className="swap-on size-4" />
    </label>
  )
}
