import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import cytoscape from 'cytoscape'
import CytoscapeComponent from 'react-cytoscapejs'
import { api, DependencyGraph as DependencyGraphData, pkgKey } from '../lib/api'
import { useInstalledPackages } from '../context/InstalledPackagesSignal'
import { useJobs } from '../context/JobsContext'
import type { DetailTarget } from './PackageDetailModal'
import { DownloadIcon, MaximizeIcon } from './Icons'

type LayoutMode = 'hierarchical' | 'force'

interface Props {
  target: DetailTarget
  onSelectPackage: (target: DetailTarget) => void
}

// Reads the app's current daisyUI theme colors straight from the resolved
// CSS custom properties on <html> (see style.css: only a light/dark pair,
// switched automatically by prefers-color-scheme -- there's no in-app theme
// toggle to hook into) so the graph's node/edge colors always match the rest
// of the UI instead of a hardcoded palette that would look wrong in dark
// mode.
function readThemeColors() {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim()
    return v || fallback
  }
  return {
    base100: get('--color-base-100', '#ffffff'),
    base300: get('--color-base-300', '#d4d4d4'),
    baseContent: get('--color-base-content', '#1f2937'),
    primary: get('--color-primary', '#4f46e5'),
    primaryContent: get('--color-primary-content', '#ffffff'),
    success: get('--color-success', '#22c55e'),
    successContent: get('--color-success-content', '#052e12'),
  }
}

function layoutOptionsFor(mode: LayoutMode, root: string): cytoscape.LayoutOptions {
  if (mode === 'hierarchical') {
    return {
      name: 'breadthfirst',
      directed: true,
      roots: [root],
      spacingFactor: 1.4,
      padding: 30,
      animate: false,
      fit: true,
    } as cytoscape.LayoutOptions
  }
  return {
    name: 'cose',
    padding: 30,
    animate: false,
    fit: true,
    nodeRepulsion: () => 9000,
    idealEdgeLength: () => 90,
    nodeOverlap: 20,
  } as cytoscape.LayoutOptions
}

/**
 * Interactive dependency graph for a package's "Dependency Graph" tab in
 * PackageDetailModal: renders BrewPackage's DependencyGraph (nodes + edges
 * from `brew deps --graph --dot`, see internal/brew.DepsGraph) with
 * cytoscape.js, colors nodes by installed status using the app's existing
 * shared installed-packages cache, and lets the user switch between a
 * hierarchical (tree) and force-directed (physics) layout, pan/zoom/fit,
 * click a node to view that package, and export the rendered graph as a
 * PNG via the same native-save-dialog flow the rest of the app uses for
 * exports.
 */
export default function DependencyGraph({ target, onSelectPackage }: Props) {
  const { t } = useTranslation()
  const { notify } = useJobs()
  const installed = useInstalledPackages()
  const [graph, setGraph] = useState<DependencyGraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('hierarchical')
  const [exporting, setExporting] = useState(false)
  const [cy, setCy] = useState<cytoscape.Core | null>(null)
  const [colors, setColors] = useState(readThemeColors)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setGraph(null)
    api
      .depsGraph(target.name, target.isCask)
      .then((g) => {
        if (!cancelled) setGraph(g)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target.name, target.isCask])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setColors(readThemeColors())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const installedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const p of installed.packages ?? []) set.add(pkgKey(p.name, p.isCask))
    return set
  }, [installed.packages])

  const elements = useMemo(() => {
    if (!graph) return []
    const nodes = graph.nodes.map((n) => ({
      data: {
        id: n.name,
        label: n.name,
        isRoot: n.name === graph.root,
        isCask: n.isCask,
        installed: installedKeys.has(pkgKey(n.name, n.isCask)),
      },
    }))
    const edges = graph.edges.map((e, i) => ({
      data: { id: `e${i}:${e.from}->${e.to}`, source: e.from, target: e.to },
    }))
    return [...nodes, ...edges]
  }, [graph, installedKeys])

  const stylesheet = useMemo<cytoscape.StylesheetJson>(
    () => [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          width: 34,
          height: 34,
          'font-size': 10,
          color: colors.baseContent,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'text-wrap': 'ellipsis',
          'text-max-width': '90px',
          'background-color': colors.base300,
          'border-width': 2,
          'border-color': colors.base300,
          'text-outline-width': 0,
        },
      },
      {
        selector: 'node[?installed]',
        style: {
          'background-color': colors.success,
          'border-color': colors.success,
          color: colors.baseContent,
        },
      },
      {
        selector: 'node[?isRoot]',
        style: {
          'background-color': colors.primary,
          'border-color': colors.primaryContent,
          'border-width': 3,
          width: 46,
          height: 46,
          'font-weight': 'bold',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1.5,
          'line-color': colors.base300,
          'target-arrow-color': colors.base300,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
        },
      },
    ],
    [colors]
  )

  // The `layout` prop passed to CytoscapeComponent is intentionally a fixed
  // no-op ('preset') -- see below -- so layout runs are entirely driven from
  // here instead of relying on react-cytoscapejs's shallow prop diffing
  // (which wouldn't reliably detect "same layout name, but the underlying
  // element set changed" as something worth re-laying-out for).
  useEffect(() => {
    if (!cy || !graph) return
    cy.layout(layoutOptionsFor(layoutMode, graph.root)).run()
  }, [cy, graph, layoutMode])

  useEffect(() => {
    if (!cy) return
    const handler = (evt: cytoscape.EventObject) => {
      const data = evt.target.data() as { id: string; isCask: boolean }
      onSelectPackage({ name: data.id, isCask: data.isCask })
    }
    cy.on('tap', 'node', handler)
    return () => {
      cy.off('tap', 'node', handler)
    }
  }, [cy, onSelectPackage])

  function fitToView() {
    cy?.fit(undefined, 30)
  }

  function zoomBy(factor: number) {
    if (!cy) return
    const level = Math.min(3, Math.max(0.1, cy.zoom() * factor))
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }

  async function exportPng() {
    if (!cy) return
    setExporting(true)
    try {
      const dataUrl = cy.png({ full: true, scale: 2, bg: colors.base100 })
      await api.exportDependencyGraphPNG(target.name, dataUrl)
    } catch (e) {
      notify('error', String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="join">
          <button
            className={`btn btn-xs join-item ${layoutMode === 'hierarchical' ? 'btn-primary' : ''}`}
            onClick={() => setLayoutMode('hierarchical')}
          >
            {t('packageDetail.depGraphLayoutHierarchical')}
          </button>
          <button
            className={`btn btn-xs join-item ${layoutMode === 'force' ? 'btn-primary' : ''}`}
            onClick={() => setLayoutMode('force')}
          >
            {t('packageDetail.depGraphLayoutForce')}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-xs btn-square" onClick={() => zoomBy(0.8)} aria-label={t('packageDetail.depGraphZoomOut')}>
            −
          </button>
          <button className="btn btn-xs btn-square" onClick={() => zoomBy(1.25)} aria-label={t('packageDetail.depGraphZoomIn')}>
            +
          </button>
          <button
            className="btn btn-xs"
            onClick={fitToView}
            aria-label={t('packageDetail.depGraphFitToViewAriaLabel')}
            title={t('packageDetail.depGraphFitToView')}
          >
            <MaximizeIcon className="size-3.5" />
          </button>
          <button className="btn btn-xs" disabled={exporting || !cy} onClick={() => void exportPng()}>
            {exporting ? <span className="loading loading-spinner loading-xs" /> : <DownloadIcon className="size-3.5" />}
            {t('packageDetail.depGraphExportPng')}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative rounded-box border border-base-300 bg-base-100" style={{ height: 320 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center gap-2 text-base-content/60 text-sm justify-center">
            <span className="loading loading-spinner loading-xs" /> {t('packageDetail.depGraphLoading')}
          </div>
        )}
        {!loading && error && (
          <div className="absolute inset-0 flex items-center justify-center text-error text-xs px-4 text-center">{error}</div>
        )}
        {!loading && !error && graph && graph.nodes.length <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center text-base-content/50 text-xs">
            {t('packageDetail.depGraphEmpty')}
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length > 1 && (
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet}
            layout={{ name: 'preset' }}
            cy={setCy}
            style={{ width: '100%', height: '100%' }}
            minZoom={0.1}
            maxZoom={3}
          />
        )}
      </div>

      {!loading && !error && graph && graph.nodes.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-base-content/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.primary }} />
            {t('packageDetail.depGraphLegendTarget')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.success }} />
            {t('packageDetail.depGraphLegendInstalled')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.base300 }} />
            {t('packageDetail.depGraphLegendNotInstalled')}
          </span>
        </div>
      )}
    </div>
  )
}
