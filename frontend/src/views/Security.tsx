import { useState } from 'react'
import { api, DuplicateApp, VulnResult } from '../lib/api'
import { AlertIcon, CopyIcon, ExternalLinkIcon, ShieldIcon, WrenchIcon } from '../components/Icons'

type Tab = 'vulns' | 'duplicates' | 'missing'

export default function Security() {
  const [tab, setTab] = useState<Tab>('vulns')

  const [vulns, setVulns] = useState<VulnResult[] | null>(null)
  const [vulnsLoading, setVulnsLoading] = useState(false)

  const [dupes, setDupes] = useState<DuplicateApp[] | null>(null)
  const [dupesLoading, setDupesLoading] = useState(false)

  const [missing, setMissing] = useState<string[] | null>(null)
  const [missingLoading, setMissingLoading] = useState(false)

  async function scanVulns() {
    setVulnsLoading(true)
    try {
      const results = await api.scanVulnerabilities()
      setVulns(results)
    } finally {
      setVulnsLoading(false)
    }
  }

  async function scanDupes() {
    setDupesLoading(true)
    try {
      const results = await api.findDuplicateApps()
      setDupes(results)
    } finally {
      setDupesLoading(false)
    }
  }

  async function scanMissing() {
    setMissingLoading(true)
    try {
      const results = await api.missing()
      setMissing(results)
    } finally {
      setMissingLoading(false)
    }
  }

  const affected = (vulns ?? []).filter((v) => v.vulnIds.length > 0)
  const errored = (vulns ?? []).filter((v) => v.error)

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Security</h1>
      <p className="text-base-content/60 text-sm mb-4">
        Vulnerability scanning and duplicate-install detection for what you have installed.
      </p>

      <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
        <button role="tab" className={`tab ${tab === 'vulns' ? 'tab-active' : ''}`} onClick={() => setTab('vulns')}>
          <ShieldIcon className="size-3.5 mr-1" /> Vulnerabilities
        </button>
        <button
          role="tab"
          className={`tab ${tab === 'duplicates' ? 'tab-active' : ''}`}
          onClick={() => setTab('duplicates')}
        >
          <CopyIcon className="size-3.5 mr-1" /> Duplicates
        </button>
        <button role="tab" className={`tab ${tab === 'missing' ? 'tab-active' : ''}`} onClick={() => setTab('missing')}>
          <WrenchIcon className="size-3.5 mr-1" /> Missing deps
        </button>
      </div>

      {tab === 'vulns' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Checks installed formulae against{' '}
            <a className="link" href="https://osv.dev" target="_blank" rel="noreferrer">
              OSV.dev
            </a>
            's public advisory database. Best-effort — casks aren't covered, and a clean scan doesn't guarantee
            there's nothing wrong, just nothing known.
          </p>
          <button className="btn btn-sm btn-primary" disabled={vulnsLoading} onClick={scanVulns}>
            {vulnsLoading ? <span className="loading loading-spinner loading-xs" /> : <ShieldIcon className="size-4" />}
            Scan installed formulae
          </button>

          {vulns && (
            <div className="mt-2">
              <div className="text-sm text-base-content/60 mb-2">
                Scanned {vulns.length} formulae — {affected.length} with known advisories
                {errored.length > 0 && `, ${errored.length} couldn't be checked`}.
              </div>
              {affected.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">No known vulnerabilities found.</div>
              ) : (
                <div className="overflow-x-auto rounded-box border border-base-300">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Version</th>
                        <th>Advisories</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affected.map((v) => (
                        <tr key={v.name} className="hover:bg-base-200">
                          <td className="font-medium">{v.name}</td>
                          <td className="font-mono text-xs">{v.version}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {v.vulnIds.map((id) => (
                                <a
                                  key={id}
                                  className="badge badge-sm badge-error badge-outline gap-1"
                                  href={`https://osv.dev/vulnerability/${id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {id} <ExternalLinkIcon className="size-3" />
                                </a>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'duplicates' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Flags names installed as both a formula and a cask — usually the same tool pulled in twice.
          </p>
          <button className="btn btn-sm btn-primary" disabled={dupesLoading} onClick={scanDupes}>
            {dupesLoading ? <span className="loading loading-spinner loading-xs" /> : <CopyIcon className="size-4" />}
            Scan for duplicates
          </button>

          {dupes && (
            <div className="mt-2">
              {dupes.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">No duplicates found.</div>
              ) : (
                <div className="overflow-x-auto rounded-box border border-base-300">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Formula version</th>
                        <th>Cask version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dupes.map((d) => (
                        <tr key={d.name} className="hover:bg-base-200">
                          <td className="font-medium flex items-center gap-1.5">
                            <AlertIcon className="size-4 text-warning" /> {d.name}
                          </td>
                          <td className="font-mono text-xs">{d.formulaVersion}</td>
                          <td className="font-mono text-xs">{d.caskVersion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'missing' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Checks installed formulae for a dependency that's supposed to be installed but isn't -- usually the sign
            of an interrupted install or a manually removed dependency.
          </p>
          <button className="btn btn-sm btn-primary" disabled={missingLoading} onClick={scanMissing}>
            {missingLoading ? <span className="loading loading-spinner loading-xs" /> : <WrenchIcon className="size-4" />}
            Check for missing dependencies
          </button>

          {missing && (
            <div className="mt-2">
              {missing.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">Nothing missing.</div>
              ) : (
                <pre className="mockup-code text-xs overflow-x-auto max-h-96">
                  <code className="whitespace-pre px-4">{missing.join('\n')}</code>
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
