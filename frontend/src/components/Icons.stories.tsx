import type { Meta, StoryObj } from '@storybook/preact-vite'
import type { VNode } from 'preact'
import * as Icons from './Icons'

// Every named export from Icons.tsx that looks like an icon component
// (PascalCase, ends in "Icon"), rendered in a grid -- keeps this gallery
// in sync with the module automatically as icons are added or removed,
// rather than needing to be hand-maintained.
const iconEntries = Object.entries(Icons).filter(
  ([name, value]) => /Icon$/.test(name) && typeof value === 'function'
) as [string, (p: { className?: string }) => VNode][]

function Gallery() {
  return (
    <div className="grid grid-cols-6 gap-4 p-6 bg-base-100">
      {iconEntries.map(([name, Icon]) => (
        <div key={name} className="flex flex-col items-center gap-2 text-center">
          <div className="p-3 rounded-box bg-base-200 text-base-content">
            <Icon className="size-6" />
          </div>
          <span className="text-xs text-base-content/60 wrap-break-word">{name}</span>
        </div>
      ))}
    </div>
  )
}

const meta: Meta<typeof Gallery> = {
  title: 'Components/Icons',
  component: Gallery,
}
export default meta

type Story = StoryObj<typeof Gallery>

export const AllIcons: Story = {}
