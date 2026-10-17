import { useSignal } from '@preact/signals'
import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useContext } from 'preact/hooks'
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

// Left as Context, not converted to a signal: this is an imperative
// one-shot dialog trigger (a single pending confirmation at a time, resolved
// by the user's click), not a cache read from many places across the tree,
// so there's no Provider-tree duplication or cross-context sequencing for a
// signal to remove.
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<ConfirmResult>) | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ComponentChildren }) {
  const { t } = useTranslation()
  const pending = useSignal<PendingConfirm | null>(null)
  const checked = useSignal<boolean[]>([])

  const confirm = useCallback(
    (opts: ConfirmOptions) => {
      checked.value = (opts.checkboxes ?? []).map((c) => c.defaultChecked ?? false)
      return new Promise<ConfirmResult>((resolve) => {
        pending.value = { ...opts, resolve }
      })
    },
    [checked, pending]
  )

  const close = (ok: boolean) => {
    pending.value?.resolve({ ok, checked: checked.value })
    pending.value = null
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
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
            <button
              className={`btn ${pending.value?.danger ? 'btn-error' : 'btn-primary'}`}
              onClick={() => close(true)}
            >
              {pending.value?.confirmLabel ?? t('confirmDialog.confirm')}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => close(false)}>close</button>
        </form>
      </dialog>
    </ConfirmContext.Provider>
  )
}
