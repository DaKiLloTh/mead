import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { TapIcon, TrashIcon } from '../components/Icons'

interface Props {
  refreshToken: number
  bump: () => void
}

export default function Taps({ refreshToken, bump }: Props) {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  const [taps, setTaps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newTap, setNewTap] = useState('')
  const [adding, setAdding] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .taps()
      .then(setTaps)
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshToken])

  async function addTap(e: FormEvent) {
    e.preventDefault()
    const name = newTap.trim()
    if (!name) return
    setAdding(true)
    await runAction(() => api.tapAdd(name))
    setAdding(false)
    setNewTap('')
    load()
    bump()
  }

  async function removeTap(name: string) {
    const ok = await confirm({ title: `Remove tap ${name}?`, danger: true, confirmLabel: 'Remove' })
    if (!ok) return
    setRowBusy(name)
    await runAction(() => api.tapRemove(name))
    setRowBusy(null)
    load()
    bump()
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Taps</h1>
      <p className="text-base-content/60 text-sm mb-4">Third-party repositories Homebrew can install from.</p>

      <form onSubmit={addTap} className="flex gap-2 mb-6">
        <label className="input input-sm flex-1">
          <TapIcon className="size-4 opacity-50" />
          <input
            type="text"
            placeholder="user/repo, e.g. homebrew/cask-fonts"
            value={newTap}
            onChange={(e) => setNewTap(e.target.value)}
          />
        </label>
        <button className="btn btn-sm btn-primary" type="submit" disabled={adding || !newTap.trim()}>
          {adding ? <span className="loading loading-spinner loading-xs" /> : 'Add tap'}
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" /> Loading…
        </div>
      ) : (
        <ul className="menu bg-base-200 rounded-box w-full">
          {taps.map((t) => (
            <li key={t}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{t}</span>
                <button
                  className="btn btn-xs btn-ghost text-error"
                  disabled={rowBusy === t}
                  onClick={() => removeTap(t)}
                  title="Untap"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </li>
          ))}
          {taps.length === 0 && <li className="text-base-content/50 text-sm px-3 py-2">No taps installed.</li>}
        </ul>
      )}
    </div>
  )
}
