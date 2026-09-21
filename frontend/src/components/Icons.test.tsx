// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/preact'
import type { ComponentType } from 'preact'
import * as Icons from './Icons'

// docs/design-language.md lists every icon from the design handoff, including
// five it says are kept unused on purpose for a future pass. An "unused
// exports" cleanup once deleted those five (see the PR that restored them), so
// this ties the code to the doc: every icon the doc names must still exist.
const doc = readFileSync(resolve(process.cwd(), '../docs/design-language.md'), 'utf8')
const iconSection = doc.slice(doc.indexOf('## Icon set'))
const documented = [...new Set([...iconSection.matchAll(/`(\w+Icon)`/g)].map((m) => m[1]))]

describe('handoff icon set', () => {
  it('finds the icons the design doc names', () => {
    expect(documented.length).toBeGreaterThanOrEqual(13)
    expect(documented).toContain('SidebarFormulasIcon')
    expect(documented).toContain('PackagePlaceholderIcon')
  })

  it.each(documented)('%s is still exported from Icons.tsx', (name) => {
    expect(typeof (Icons as Record<string, unknown>)[name]).toBe('function')
  })
})

describe('every icon component', () => {
  const all = Object.entries(Icons).filter(([name, value]) => /Icon$/.test(name) && typeof value === 'function') as [
    string,
    ComponentType<{ className?: string }>,
  ][]

  it.each(all)('%s renders an svg and passes className through', (_name, Icon) => {
    const { container } = render(<Icon className="size-4" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('class')).toBe('size-4')
  })
})
