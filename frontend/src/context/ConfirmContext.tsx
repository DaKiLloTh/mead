import { signal } from '@preact/signals'
import { useTranslation } from 'react-i18next'

interface ConfirmCheckbox {
  label: string
  defaultChecked?: boolean
}

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  checkboxes?: ConfirmCheckbox[]
}

interface ConfirmResult {
  ok: boolean
  checked: boolean[]
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void
}

// Module-level signal store for the single pending confirmation. confirm()
// opens the dialog and resolves when the user picks; <ConfirmDialog />,
// rendered once in App, draws it. The file keeps its old name so
// .storybook/main.ts can keep aliasing it to the inert mock.
const pending = signal<PendingConfirm | null>(null)
const checked = signal<boolean[]>([])

export function confirm(opts: ConfirmOptions): Promise<ConfirmResult> {
  checked.value = (opts.checkboxes ?? []).map((c) => c.defaultChecked ?? false)
  return new Promise<ConfirmResult>((resolve) => {
    pending.value = { ...opts, resolve }
  })
}

function close(ok: boolean) {
  pending.value?.resolve({ ok, checked: checked.value })
  pending.value = null
}

export function useConfirm() {
  return confirm
}

export function ConfirmDialog() {
  const { t } = useTranslation()
  return (
    <dialog className={`modal ${pending.value ? 'modal-open' : ''}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg">{pending.value?.title}</h3>
        {pending.value?.body && <p className="py-3 text-sm text-base-content/70">{pending.value.body}</p>}
        {pending.value?.checkboxes?.map((cb, i) => (
          <label key={i} className="label cursor-pointer justify-start gap-2 mt-1">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={checked.value[i] ?? false}
              onChange={(e) => {
                const next = [...checked.value]
                next[i] = e.currentTarget.checked
                checked.value = next
              }}
            />
            <span className="label-text">{cb.label}</span>
          </label>
        ))}
        <div className="modal-action">
          <button className="btn" onClick={() => close(false)}>
            {pending.value?.cancelLabel ?? t('confirmDialog.cancel')}
          </button>
          <button className={`btn ${pending.value?.danger ? 'btn-error' : 'btn-primary'}`} onClick={() => close(true)}>
            {pending.value?.confirmLabel ?? t('confirmDialog.confirm')}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={() => close(false)}>close</button>
      </form>
    </dialog>
  )
}
