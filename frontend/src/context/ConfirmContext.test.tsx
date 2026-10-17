// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { confirm, ConfirmDialog } from './ConfirmContext'

afterEach(cleanup)

describe('confirm', () => {
  it('opens the dialog and resolves with the choice and checkbox states', async () => {
    render(<ConfirmDialog />)
    let result: Promise<{ ok: boolean; checked: boolean[] }> | undefined
    await act(async () => {
      result = confirm({
        title: 'Remove it?',
        confirmLabel: 'Remove',
        checkboxes: [{ label: 'Also data' }, { label: 'Snapshot', defaultChecked: true }],
      })
    })
    expect(screen.getByText('Remove it?')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Also data'))
    fireEvent.click(screen.getByText('Remove'))

    await expect(result).resolves.toEqual({ ok: true, checked: [true, true] })
    expect(screen.queryByText('Remove it?')).toBeNull()
  })

  it('resolves not ok on cancel', async () => {
    render(<ConfirmDialog />)
    let result: Promise<{ ok: boolean; checked: boolean[] }> | undefined
    await act(async () => {
      result = confirm({ title: 'Sure?' })
    })
    fireEvent.click(screen.getByText('confirmDialog.cancel'))
    await expect(result).resolves.toEqual({ ok: false, checked: [] })
  })
})
