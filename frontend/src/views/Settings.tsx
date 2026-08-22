import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { useUserData } from '../context/UserDataContext'

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

export default function Settings() {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const userData = useUserData()

  const [analytics, setAnalytics] = useState<string | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsBusy, setAnalyticsBusy] = useState<string | null>(null)

  const [appDir, setAppDir] = useState('')
  const [appDirSaved, setAppDirSaved] = useState(false)

  const [size, setSize] = useState<SizeKey>(getInitialSize)

  function loadAnalytics() {
    setAnalyticsLoading(true)
    api
      .analyticsState()
      .then(setAnalytics)
      .catch((e) => setAnalytics(String(e)))
      .finally(() => setAnalyticsLoading(false))
  }

  useEffect(loadAnalytics, [])

  useEffect(() => {
    setAppDir(userData.data?.settings?.caskAppDir ?? '')
  }, [userData.data])

  useEffect(() => {
    const found = SIZES.find((s) => s.key === size) ?? SIZES[1]
    document.documentElement.style.fontSize = found.scale
    localStorage.setItem('textSize', size)
  }, [size])

  async function analyticsToggle(enabled: boolean) {
    setAnalyticsBusy(enabled ? 'on' : 'off')
    await runAction(() => api.analyticsSetEnabled(enabled))
    setAnalyticsBusy(null)
    loadAnalytics()
  }

  async function analyticsRegenerate() {
    setAnalyticsBusy('regen')
    await runAction(() => api.analyticsRegenerateUUID())
    setAnalyticsBusy(null)
    loadAnalytics()
  }

  async function saveAppDir() {
    await api.setCaskAppDir(appDir.trim())
    userData.refresh()
    setAppDirSaved(true)
    setTimeout(() => setAppDirSaved(false), 2000)
  }

  async function clearAllData() {
    const { ok } = await confirm({
      title: 'Clear all local mead data?',
      body: 'Removes favorites, tags, notes, snoozes, and activity history. This only affects data mead keeps for itself — nothing installed by Homebrew is touched.',
      confirmLabel: 'Clear data',
      danger: true,
    })
    if (!ok) return
    await api.clearAllData()
    userData.refresh()
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-base-content/60 text-sm">Preferences for mead and for Homebrew itself.</p>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">Privacy</h2>
          <p className="text-sm text-base-content/70">
            mead never sends its own commands' analytics to Homebrew (suppressed automatically), but this controls
            Homebrew's own global analytics preference — the one that also applies if you use `brew` directly in a
            terminal.
          </p>
          {analyticsLoading ? (
            <div className="flex items-center gap-2 text-base-content/60 text-sm py-1">
              <span className="loading loading-spinner loading-xs" /> Checking…
            </div>
          ) : (
            <pre className="mockup-code text-xs mt-1">
              <code className="px-4">{analytics}</code>
            </pre>
          )}
          <div className="flex flex-wrap gap-2 mt-1">
            <button className="btn btn-sm" disabled={analyticsBusy !== null} onClick={() => analyticsToggle(true)}>
              {analyticsBusy === 'on' && <span className="loading loading-spinner loading-xs" />} Turn on
            </button>
            <button className="btn btn-sm" disabled={analyticsBusy !== null} onClick={() => analyticsToggle(false)}>
              {analyticsBusy === 'off' && <span className="loading loading-spinner loading-xs" />} Turn off
            </button>
            <button className="btn btn-sm btn-ghost" disabled={analyticsBusy !== null} onClick={analyticsRegenerate}>
              {analyticsBusy === 'regen' && <span className="loading loading-spinner loading-xs" />} Regenerate anonymous ID
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">Casks</h2>
          <p className="text-sm text-base-content/70">
            Where cask apps get installed. Leave blank for Homebrew's default (<span className="font-mono">/Applications</span>).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-sm flex-1"
              placeholder="/Applications"
              value={appDir}
              onChange={(e) => setAppDir(e.target.value)}
            />
            <button className="btn btn-sm btn-primary" onClick={saveAppDir}>
              {appDirSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">Appearance</h2>
          <p className="text-sm text-base-content/70">
            Light/dark follows your system setting automatically. Text size:
          </p>
          <div className="join w-fit">
            {SIZES.map((s) => (
              <button
                key={s.key}
                className={`btn btn-sm join-item ${size === s.key ? 'btn-primary' : ''}`}
                onClick={() => setSize(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">Data</h2>
          <p className="text-sm text-base-content/70">
            Favorites, tags, notes, snoozes, and history are stored locally at{' '}
            <span className="font-mono">~/Library/Application Support/mead/store.json</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => api.revealLocalDataFile()}>
              Reveal in Finder
            </button>
            <button className="btn btn-sm btn-error btn-outline" onClick={clearAllData}>
              Clear all local data
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
