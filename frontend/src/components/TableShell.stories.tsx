import type { Meta, StoryObj } from '@storybook/preact-vite'
import TableShell from './TableShell'

const rows = [
  { name: 'wget', version: '1.25.0' },
  { name: 'ffmpeg', version: '8.0' },
  { name: 'imagemagick', version: '7.1.1' },
]

const meta: Meta<typeof TableShell> = {
  title: 'Components/TableShell',
  component: TableShell,
}
export default meta

type Story = StoryObj<typeof TableShell>

export const Default: Story = {
  render: () => (
    <TableShell colgroup={[<col />, <col className="w-32" />]}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Version</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="hover:bg-base-200">
            <td className="font-medium">{r.name}</td>
            <td className="font-mono text-xs">{r.version}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  ),
}
