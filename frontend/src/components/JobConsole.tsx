import { useEffect, useRef } from 'react'
import { useJobs } from '../context/JobsContext'
import { duration } from '../lib/format'

function StatusIcon({ status }: { status: 'running' | 'success' | 'error' }) {
  if (status === 'running') return <span className="loading loading-spinner loading-xs text-primary" />
  if (status === 'success') return <span className="status status-success" />
  return <span className="status status-error" />
}

export default function JobConsole() {
  const { jobs, activeCount, consoleOpen, setConsoleOpen, selectedJobId, setSelectedJobId, cancelJob } = useJobs()
  const bodyRef = useRef<HTMLDivElement>(null)

  const selected = jobs.find((j) => j.id === selectedJobId) ?? jobs[jobs.length - 1]

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [selected?.lines.length, selected?.id])

  if (jobs.length === 0) {
    return null
  }

  return (
    <div className="border-t border-base-300 bg-base-100 flex flex-col shrink-0" style={{ height: consoleOpen ? 280 : 40 }}>
      <button
        className="flex items-center gap-2 px-3 h-10 shrink-0 text-sm hover:bg-base-200 transition-colors"
        onClick={() => setConsoleOpen(!consoleOpen)}
      >
        <span className="font-medium">Activity</span>
        {activeCount > 0 && <span className="badge badge-primary badge-sm">{activeCount} running</span>}
        <span className="flex-1" />
        {selected && (
          <span className="text-base-content/60 truncate max-w-xs">{selected.title}</span>
        )}
        <span className="text-base-content/50">{consoleOpen ? '▾' : '▴'}</span>
      </button>

      {consoleOpen && (
        <div className="flex flex-1 min-h-0">
          <ul className="menu menu-sm w-56 shrink-0 border-r border-base-300 flex-nowrap overflow-y-auto flex-col">
            {[...jobs].reverse().map((j) => (
              <li key={j.id}>
                <button
                  className={j.id === selected?.id ? 'menu-active' : ''}
                  onClick={() => setSelectedJobId(j.id)}
                >
                  <StatusIcon status={j.status} />
                  <span className="truncate">{j.title}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 flex flex-col min-w-0">
            {selected && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-base-300 text-xs text-base-content/60">
                <StatusIcon status={selected.status} />
                <span>
                  {selected.status === 'running'
                    ? 'Running…'
                    : selected.status === 'success'
                      ? `Finished in ${duration(selected.startedAt, selected.endedAt ?? Date.now())}`
                      : `Failed (exit ${selected.exitCode ?? '?'})`}
                </span>
                <span className="flex-1" />
                {selected.status === 'running' && (
                  <button className="btn btn-ghost btn-xs" onClick={() => cancelJob(selected.id)}>
                    Cancel
                  </button>
                )}
              </div>
            )}
            <div ref={bodyRef} className="flex-1 overflow-y-auto bg-neutral text-neutral-content font-mono text-xs p-3">
              {selected?.lines.length ? (
                selected.lines.map((l, i) => (
                  <div key={i} className={l.stream === 'stderr' ? 'text-error-content/90' : ''}>
                    {l.text}
                  </div>
                ))
              ) : (
                <div className="opacity-50">Waiting for output…</div>
              )}
              {selected?.error && <div className="text-warning mt-1">{selected.error}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
