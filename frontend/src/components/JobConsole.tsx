import { useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { useJobs } from '../context/JobsContext'
import { duration } from '../lib/format'
import { api } from '../lib/api'
import ExternalLink from './ExternalLink'

function StatusIcon({ status }: { status: 'running' | 'success' | 'error' }) {
  if (status === 'running') return <span className="loading loading-spinner loading-xs text-primary" />
  if (status === 'success') return <span className="status status-success" />
  return <span className="status status-error" />
}

const gistableTitleRe = /^(?:Install|Upgrade|Reinstall) (\S+)/

function GistLogsButton({ title }: { title: string }) {
  const { t } = useTranslation()
  const m = gistableTitleRe.exec(title)
  const [state, setState] = useState<'idle' | 'loading' | { url: string } | { error: string }>('idle')

  if (!m) return null
  const name = m[1]

  async function create() {
    setState('loading')
    try {
      const url = await api.gistLogs(name)
      setState({ url })
    } catch (e) {
      setState({ error: String(e) })
    }
  }

  if (state === 'idle') {
    return (
      <button className="btn btn-ghost btn-xs" onClick={create}>
        {t('jobConsole.createGist')}
      </button>
    )
  }
  if (state === 'loading') {
    return (
      <span className="btn btn-ghost btn-xs" aria-disabled>
        <span className="loading loading-spinner loading-xs" /> {t('jobConsole.uploading')}
      </span>
    )
  }
  if ('url' in state) {
    return (
      <ExternalLink className="link link-primary text-xs" href={state.url}>
        {state.url}
      </ExternalLink>
    )
  }
  return <span className="text-error text-xs">{state.error}</span>
}

export default function JobConsole() {
  const { t } = useTranslation()
  const {
    jobs,
    activeCount,
    consoleOpen,
    setConsoleOpen,
    selectedJobId,
    setSelectedJobId,
    cancelJob,
    clearFinishedJobs,
  } = useJobs()
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
    <div
      className="border-t border-base-300 bg-base-100 flex flex-col shrink-0"
      style={{ height: consoleOpen ? 280 : 40 }}
    >
      <div className="flex items-center gap-2 px-3 h-10 shrink-0 text-sm">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 h-full hover:bg-base-200 transition-colors -mx-3 px-3"
          onClick={() => setConsoleOpen(!consoleOpen)}
        >
          <span className="font-medium">{t('jobConsole.activity')}</span>
          {activeCount > 0 && (
            <span className="badge badge-primary badge-sm">{t('jobConsole.running', { count: activeCount })}</span>
          )}
          <span className="flex-1" />
          {selected && <span className="text-base-content/60 truncate max-w-xs">{selected.title}</span>}
          <span className="text-base-content/50">{consoleOpen ? '▾' : '▴'}</span>
        </button>
        {activeCount === 0 && (
          <button
            className="btn btn-ghost btn-xs btn-circle shrink-0"
            title={t('jobConsole.closeTooltip')}
            onClick={clearFinishedJobs}
          >
            ✕
          </button>
        )}
      </div>

      {consoleOpen && (
        <div className="flex flex-1 min-h-0">
          <ul className="menu menu-sm w-56 shrink-0 border-r border-base-300 flex-nowrap overflow-y-auto flex-col">
            {[...jobs].reverse().map((j) => (
              <li key={j.id}>
                <button className={j.id === selected?.id ? 'menu-active' : ''} onClick={() => setSelectedJobId(j.id)}>
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
                    ? t('jobConsole.runningStatus')
                    : selected.status === 'success'
                      ? t('jobConsole.finishedIn', {
                          // endedAt is always set alongside status:'success' by jobTracker's
                          // handleDone -- the fallback to startedAt (0 duration) only matters
                          // for TS's benefit, since endedAt is typed optional independently of
                          // status. Falls back to startedAt rather than Date.now() to keep this
                          // pure: an impure call here would make render output nondeterministic.
                          duration: duration(selected.startedAt, selected.endedAt ?? selected.startedAt),
                        })
                      : t('jobConsole.failedExitCode', { code: selected.exitCode ?? '?' })}
                </span>
                <span className="flex-1" />
                {selected.status === 'running' && (
                  <button className="btn btn-ghost btn-xs" onClick={() => cancelJob(selected.id)}>
                    {t('jobConsole.cancel')}
                  </button>
                )}
                {selected.status === 'error' && <GistLogsButton title={selected.title} />}
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
                <div className="opacity-50">{t('jobConsole.waitingForOutput')}</div>
              )}
              {selected?.error && <div className="text-warning mt-1">{selected.error}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
