import { useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { useSignalRef } from '@preact/signals/utils'
import { useTranslation } from 'react-i18next'
import { jobsSignal, selectedJobIdSignal, useJobs } from '../context/JobsContext'
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
  const state = useSignal<'idle' | 'loading' | { url: string } | { error: string }>('idle')

  if (!m) return null
  const name = m[1]

  async function create() {
    state.value = 'loading'
    try {
      const url = await api.gistLogs(name)
      state.value = { url }
    } catch (e) {
      state.value = { error: String(e) }
    }
  }

  if (state.value === 'idle') {
    return (
      <button className="btn btn-ghost btn-xs" onClick={create}>
        {t('jobConsole.createGist')}
      </button>
    )
  }
  if (state.value === 'loading') {
    return (
      <span className="btn btn-ghost btn-xs" aria-disabled>
        <span className="loading loading-spinner loading-xs" /> {t('jobConsole.uploading')}
      </span>
    )
  }
  if ('url' in state.value) {
    return (
      <ExternalLink className="link link-primary text-xs" href={state.value.url}>
        {state.value.url}
      </ExternalLink>
    )
  }
  return <span className="text-error text-xs">{state.value.error}</span>
}

export default function JobConsole() {
  const { t } = useTranslation()
  const { jobs, activeCount, consoleOpen, setConsoleOpen, setSelectedJobId, cancelJob, clearFinishedJobs } = useJobs()
  const bodyEl = useSignalRef<HTMLDivElement | null>(null)

  const selectedSignal = useComputed(() => {
    const all = jobsSignal.value
    return all.find((j) => j.id === selectedJobIdSignal.value) ?? all[all.length - 1]
  })
  const selected = selectedSignal.value

  // Only a pty-backed job (currently mas upgrade -- see App.SendJobInput)
  // can actually receive this. The draft is tagged with the job it was
  // typed for, so a half-typed password from a previous job never shows up
  // in the next one's input box.
  const draft = useSignal<{ jobId: string; text: string } | null>(null)
  const inputValue = useComputed(() =>
    draft.value && draft.value.jobId === selectedSignal.value?.id ? draft.value.text : ''
  )

  function sendInput() {
    if (!selected || !inputValue.value) return
    void api.sendJobInput(selected.id, inputValue.value)
    draft.value = null
  }

  // Keeps the output scrolled to the bottom as lines arrive or the
  // selected job changes. Runs after the render, so scrollHeight is current.
  useSignalEffect(() => {
    void selectedSignal.value?.lines.length
    void selectedSignal.value?.id
    const body = bodyEl.peek()
    if (body) body.scrollTop = body.scrollHeight
  })

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
            <div ref={bodyEl} className="flex-1 overflow-y-auto bg-neutral text-neutral-content font-mono text-xs p-3">
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
            {selected?.interactive && selected.status === 'running' && (
              <div className="border-t border-base-300 p-2">
                <input
                  type="password"
                  autoFocus
                  className="input input-sm w-full font-mono"
                  placeholder={t('jobConsole.inputPlaceholder')}
                  value={inputValue.value}
                  onChange={(e) => selected && (draft.value = { jobId: selected.id, text: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendInput()
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
