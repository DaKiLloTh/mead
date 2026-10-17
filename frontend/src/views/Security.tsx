import { useSignal } from '@preact/signals'
import { Trans, useTranslation } from 'react-i18next'
import { api, DuplicateApp, VulnResult, VulnSeverity } from '../lib/api'
import { AlertIcon, CopyIcon, ExternalLinkIcon, ShieldIcon, WrenchIcon } from '../components/Icons'
import ExternalLink from '../components/ExternalLink'
import SeverityBadge from '../components/SeverityBadge'
import PatchedBadge from '../components/PatchedBadge'

type Tab = 'vulns' | 'duplicates' | 'missing'

export default function Security() {
  const { t } = useTranslation()
  const tab = useSignal<Tab>('vulns')

  const vulns = useSignal<VulnResult[] | null>(null)
  const vulnsLoading = useSignal(false)

  const dupes = useSignal<DuplicateApp[] | null>(null)
  const dupesLoading = useSignal(false)

  const missing = useSignal<string[] | null>(null)
  const missingLoading = useSignal(false)

  async function scanVulns() {
    vulnsLoading.value = true
    try {
      const results = await api.scanVulnerabilities()
      vulns.value = results
    } finally {
      vulnsLoading.value = false
    }
  }

  async function scanDupes() {
    dupesLoading.value = true
    try {
      const results = await api.findDuplicateApps()
      dupes.value = results
    } finally {
      dupesLoading.value = false
    }
  }

  async function scanMissing() {
    missingLoading.value = true
    try {
      const results = await api.missing()
      missing.value = results
    } finally {
      missingLoading.value = false
    }
  }

  const affected = (vulns.value ?? []).filter((v) => v.open.length > 0)
  const patchedOnly = (vulns.value ?? []).filter((v) => v.open.length === 0 && v.patched.length > 0)
  const errored = (vulns.value ?? []).filter((v) => v.error)

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">{t('security.title')}</h1>
      <p className="text-base-content/60 text-sm mb-4">{t('security.subtitle')}</p>

      <div role="tablist" className="tabs tabs-box tabs-sm w-fit mb-4">
        <button
          role="tab"
          className={`tab ${tab.value === 'vulns' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'vulns')}
        >
          <ShieldIcon className="size-3.5 mr-1" /> {t('security.tabVulnerabilities')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'duplicates' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'duplicates')}
        >
          <CopyIcon className="size-3.5 mr-1" /> {t('security.tabDuplicates')}
        </button>
        <button
          role="tab"
          className={`tab ${tab.value === 'missing' ? 'tab-active' : ''}`}
          onClick={() => (tab.value = 'missing')}
        >
          <WrenchIcon className="size-3.5 mr-1" /> {t('security.tabMissingDeps')}
        </button>
      </div>

      {tab.value === 'vulns' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            <Trans
              i18nKey="security.vulnsDescription"
              components={
                {
                  link: (
                    <ExternalLink className="link" href="https://osv.dev">
                      OSV.dev
                    </ExternalLink>
                  ),
                } as any
              }
            />
          </p>
          <button className="btn btn-sm btn-primary" disabled={vulnsLoading.value} onClick={scanVulns}>
            {vulnsLoading.value ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <ShieldIcon className="size-4" />
            )}
            {t('security.scanFormulae')}
          </button>

          {vulns.value && (
            <div className="mt-2 space-y-3">
              <div className="text-sm text-base-content/60">
                {t('security.scanSummary', { count: vulns.value.length, affectedCount: affected.length })}
                {patchedOnly.length > 0 && t('security.scanSummaryPatchedSuffix', { count: patchedOnly.length })}
                {errored.length > 0 && t('security.scanSummaryErroredSuffix', { count: errored.length })}.
              </div>

              {affected.length === 0 && patchedOnly.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">{t('security.noVulnerabilities')}</div>
              ) : (
                <>
                  {affected.length > 0 && (
                    <div className="overflow-x-auto rounded-box border border-base-300">
                      <table className="table table-sm table-fixed">
                        <colgroup>
                          <col />
                          <col className="w-24" />
                          <col className="w-80" />
                          <col className="w-24" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>{t('security.colPackage')}</th>
                            <th>{t('security.colVersion')}</th>
                            <th>{t('security.colAdvisories')}</th>
                            <th>{t('security.colPatched')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {affected.map((v) => (
                            <tr key={v.name} className="hover:bg-base-200">
                              <td className="font-medium truncate">{v.name}</td>
                              <td className="font-mono text-xs truncate" title={v.version}>
                                {v.version}
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {v.open.map((vuln) => (
                                    <ExternalLink
                                      key={vuln.id}
                                      className="badge badge-sm badge-outline gap-1"
                                      href={`https://osv.dev/vulnerability/${vuln.id}`}
                                      title={vuln.summary || vuln.id}
                                    >
                                      {vuln.id}
                                      <SeverityBadge severity={vuln.severity as VulnSeverity} size="xs" />
                                      <ExternalLinkIcon className="size-3" />
                                    </ExternalLink>
                                  ))}
                                </div>
                              </td>
                              <td>
                                {v.patched.length > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <PatchedBadge size="xs" /> {t('security.patchedCount', { count: v.patched.length })}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {patchedOnly.length > 0 && (
                    <div className="rounded-box border border-base-300 p-3 space-y-2">
                      <div className="text-xs text-base-content/60 flex items-center gap-1.5">
                        <PatchedBadge size="xs" />
                        {t('security.patchedOnlyHeading', { count: patchedOnly.length })}
                      </div>
                      <div className="space-y-1.5">
                        {patchedOnly.map((v) => (
                          <div key={v.name} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium">{v.name}</span>
                            <span className="font-mono text-base-content/50" title={v.version}>
                              {v.version}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {v.patched.map((vuln) => (
                                <ExternalLink
                                  key={vuln.id}
                                  className="badge badge-xs badge-outline gap-1"
                                  href={`https://osv.dev/vulnerability/${vuln.id}`}
                                  title={vuln.summary || vuln.id}
                                >
                                  {vuln.id} <ExternalLinkIcon className="size-3" />
                                </ExternalLink>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab.value === 'duplicates' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">{t('security.duplicatesDescription')}</p>
          <button className="btn btn-sm btn-primary" disabled={dupesLoading.value} onClick={scanDupes}>
            {dupesLoading.value ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <CopyIcon className="size-4" />
            )}
            {t('security.scanDuplicates')}
          </button>

          {dupes.value && (
            <div className="mt-2">
              {dupes.value.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">{t('security.noDuplicates')}</div>
              ) : (
                <div className="overflow-x-auto rounded-box border border-base-300">
                  <table className="table table-sm table-fixed">
                    <colgroup>
                      <col />
                      <col className="w-36" />
                      <col className="w-36" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t('security.colName')}</th>
                        <th>{t('security.colFormulaVersion')}</th>
                        <th>{t('security.colCaskVersion')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dupes.value.map((d) => (
                        <tr key={d.name} className="hover:bg-base-200">
                          <td className="font-medium flex items-center gap-1.5 min-w-0">
                            <AlertIcon className="size-4 text-warning shrink-0" />{' '}
                            <span className="truncate">{d.name}</span>
                          </td>
                          <td className="font-mono text-xs truncate" title={d.formulaVersion}>
                            {d.formulaVersion}
                          </td>
                          <td className="font-mono text-xs truncate" title={d.caskVersion}>
                            {d.caskVersion}
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

      {tab.value === 'missing' && (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">{t('security.missingDescription')}</p>
          <button className="btn btn-sm btn-primary" disabled={missingLoading.value} onClick={scanMissing}>
            {missingLoading.value ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <WrenchIcon className="size-4" />
            )}
            {t('security.checkMissing')}
          </button>

          {missing.value && (
            <div className="mt-2">
              {missing.value.length === 0 ? (
                <div className="alert alert-success alert-soft text-sm">{t('security.nothingMissing')}</div>
              ) : (
                <pre className="mockup-code text-xs overflow-x-auto max-h-96">
                  <code className="whitespace-pre px-4">{missing.value.join('\n')}</code>
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
