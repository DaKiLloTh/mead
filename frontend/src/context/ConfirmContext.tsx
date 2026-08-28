import React, { createContext, useCallback, useContext, useState } from 'react'
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

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [checked, setChecked] = useState<boolean[]>([])

  const confirm = useCallback((opts: ConfirmOptions) => {
    setChecked((opts.checkboxes ?? []).map((c) => c.defaultChecked ?? false))
    return new Promise<ConfirmResult>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = (ok: boolean) => {
    pending?.resolve({ ok, checked })
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog className={`modal ${pending ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">{pending?.title}</h3>
          {pending?.body && <p className="py-3 text-sm text-base-content/70">{pending.body}</p>}
          {pending?.checkboxes?.map((cb, i) => (
            <label key={i} className="label cursor-pointer justify-start gap-2 mt-1">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={checked[i] ?? false}
                onChange={(e) =>
                  setChecked((prev) => {
                    const next = [...prev]
                    next[i] = e.target.checked
                    return next
                  })
                }
              />
              <span className="label-text">{cb.label}</span>
            </label>
          ))}
          <div className="modal-action">
            <button className="btn" onClick={() => close(false)}>
              {pending?.cancelLabel ?? t('confirmDialog.cancel')}
            </button>
            <button
              className={`btn ${pending?.danger ? 'btn-error' : 'btn-primary'}`}
              onClick={() => close(true)}
            >
              {pending?.confirmLabel ?? t('confirmDialog.confirm')}
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
