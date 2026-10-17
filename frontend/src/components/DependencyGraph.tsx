import { untracked, useComputed, useSignal, useSignalEffect } from '@preact/signals'
import { useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import cytoscape from 'cytoscape'
import CytoscapeComponent from 'react-cytoscapejs'

// react-cytoscapejs's own types are written against React's ComponentClass,
// which doesn't structurally match Preact's JSX.Element under our
// jsxImportSource: 'preact' tsconfig (ComponentChildren vs ReactNode) --
// the component itself runs fine at runtime via the preact/compat alias in
// vite.config.ts, this cast only works around the type mismatch.
const CytoscapeGraph = CytoscapeComponent as unknown as (props: Record<string, unknown>) => import('preact').VNode
import { api, DependencyGraph as DependencyGraphData, pkgKey } from '../lib/api'
import { installedPackagesSignal } from '../context/InstalledPackagesSignal'
import { themeColorsSignal } from '../context/ThemeColorsSignal'
import { useJobs } from '../context/JobsContext'
import type { DetailTarget } from './PackageDetailModal'
import { DownloadIcon, MaximizeIcon } from './Icons'

type LayoutMode = 'hierarchical' | 'force'

interface Props {
  target: DetailTarget
  onSelectPackage: (target: DetailTarget) => void
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
  const graph = useSignal<DependencyGraphData | null>(null)
  const loading = useSignal(false)
  const error = useSignal<string | null>(null)
  const layoutMode = useSignal<LayoutMode>('hierarchical')
  const exporting = useSignal(false)
  const cy = useSignal<cytoscape.Core | null>(null)
  const colors = themeColorsSignal()
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Fetches once per mount. PackageDetailModal keys this component on the
  // package, so a different target is a fresh mount.
  useSignalEffect(() =>
    untracked(() => {
      let cancelled = false
      loading.value = true
      error.value = null
      graph.value = null
      api
        .depsGraph(target.name, target.isCask)
        .then((g) => {
          if (!cancelled) graph.value = g
        })
        .catch((e) => {
          if (!cancelled) error.value = String(e)
        })
        .finally(() => {
          if (!cancelled) loading.value = false
        })
      return () => {
        cancelled = true
      }
    })
  )

  const installedKeys = useComputed(() => {
    const set = new Set<string>()
    for (const p of installedPackagesSignal.value.packages ?? []) set.add(pkgKey(p.name, p.isCask))
    return set
  })

  const elements = useComputed(() => {
    const g = graph.value
    if (!g) return []
    const nodes = g.nodes.map((n) => ({
      data: {
        id: n.name,
        label: n.name,
        isRoot: n.name === g.root,
        isCask: n.isCask,
        installed: installedKeys.value.has(pkgKey(n.name, n.isCask)),
      },
    }))
    const edges = g.edges.map((e, i) => ({
      data: { id: `e${i}:${e.from}->${e.to}`, source: e.from, target: e.to },
    }))
    return [...nodes, ...edges]
  })

  const stylesheet = useComputed<cytoscape.StylesheetJson>(() => [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        width: 34,
        height: 34,
        'font-size': 10,
        color: colors.value.baseContent,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'text-wrap': 'ellipsis',
        'text-max-width': '90px',
        'background-color': colors.value.base300,
        'border-width': 2,
        'border-color': colors.value.base300,
        'text-outline-width': 0,
      },
    },
    {
      selector: 'node[?installed]',
      style: {
        'background-color': colors.value.success,
        'border-color': colors.value.success,
        color: colors.value.baseContent,
      },
    },
    {
      selector: 'node[?isRoot]',
      style: {
        'background-color': colors.value.primary,
        'border-color': colors.value.primaryContent,
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
        'line-color': colors.value.base300,
        'target-arrow-color': colors.value.base300,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
      },
    },
  ])

  // The `layout` prop passed to CytoscapeComponent is intentionally a fixed
  // no-op ('preset') -- see below -- so layout runs are entirely driven from
  // here instead of relying on react-cytoscapejs's shallow prop diffing
  // (which wouldn't reliably detect "same layout name, but the underlying
  // element set changed" as something worth re-laying-out for).
  useSignalEffect(() => {
    const c = cy.value
    const g = graph.value
    const mode = layoutMode.value
    if (!c || !g) return
    untracked(() => c.layout(layoutOptionsFor(mode, g.root)).run())
  })

  useSignalEffect(() => {
    const c = cy.value
    if (!c) return
    const handler = (evt: cytoscape.EventObject) => {
      const data = evt.target.data() as { id: string; isCask: boolean }
      onSelectPackage({ name: data.id, isCask: data.isCask })
    }
    c.on('tap', 'node', handler)
    return () => {
      c.off('tap', 'node', handler)
    }
  })

  function fitToView() {
    cy.value?.fit(undefined, 30)
  }

  function zoomBy(factor: number) {
    if (!cy.value) return
    const level = Math.min(3, Math.max(0.1, cy.value.zoom() * factor))
    cy.value.zoom({ level, renderedPosition: { x: cy.value.width() / 2, y: cy.value.height() / 2 } })
  }

  async function exportPng() {
    if (!cy.value) return
    exporting.value = true
    try {
      const dataUrl = cy.value.png({ full: true, scale: 2, bg: colors.value.base100 })
      await api.exportDependencyGraphPNG(target.name, dataUrl)
    } catch (e) {
      notify('error', String(e))
    } finally {
      exporting.value = false
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="join">
          <button
            className={`btn btn-xs join-item ${layoutMode.value === 'hierarchical' ? 'btn-primary' : ''}`}
            onClick={() => (layoutMode.value = 'hierarchical')}
          >
            {t('packageDetail.depGraphLayoutHierarchical')}
          </button>
          <button
            className={`btn btn-xs join-item ${layoutMode.value === 'force' ? 'btn-primary' : ''}`}
            onClick={() => (layoutMode.value = 'force')}
          >
            {t('packageDetail.depGraphLayoutForce')}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-xs btn-square"
            onClick={() => zoomBy(0.8)}
            aria-label={t('packageDetail.depGraphZoomOut')}
          >
            −
          </button>
          <button
            className="btn btn-xs btn-square"
            onClick={() => zoomBy(1.25)}
            aria-label={t('packageDetail.depGraphZoomIn')}
          >
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
          <button className="btn btn-xs" disabled={exporting.value || !cy.value} onClick={() => void exportPng()}>
            {exporting.value ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <DownloadIcon className="size-3.5" />
            )}
            {t('packageDetail.depGraphExportPng')}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-box border border-base-300 bg-base-100"
        style={{ height: 320 }}
      >
        {loading.value && (
          <div className="absolute inset-0 flex items-center gap-2 text-base-content/60 text-sm justify-center">
            <span className="loading loading-spinner loading-xs" /> {t('packageDetail.depGraphLoading')}
          </div>
        )}
        {!loading.value && error.value && (
          <div className="absolute inset-0 flex items-center justify-center text-error text-xs px-4 text-center">
            {error.value}
          </div>
        )}
        {!loading.value && !error.value && graph.value && graph.value.nodes.length <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center text-base-content/50 text-xs">
            {t('packageDetail.depGraphEmpty')}
          </div>
        )}
        {!loading.value && !error.value && graph.value && graph.value.nodes.length > 1 && (
          <CytoscapeGraph
            elements={elements.value}
            stylesheet={stylesheet.value}
            layout={{ name: 'preset' }}
            cy={(v: cytoscape.Core) => (cy.value = v)}
            style={{ width: '100%', height: '100%' }}
            minZoom={0.1}
            maxZoom={3}
          />
        )}
      </div>

      {!loading.value && !error.value && graph.value && graph.value.nodes.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-base-content/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.value.primary }} />
            {t('packageDetail.depGraphLegendTarget')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.value.success }} />
            {t('packageDetail.depGraphLegendInstalled')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors.value.base300 }} />
            {t('packageDetail.depGraphLegendNotInstalled')}
          </span>
        </div>
      )}
    </div>
  )
}
