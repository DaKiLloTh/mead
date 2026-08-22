import React, { createContext, useCallback, useContext, useState } from 'react'

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
  checkbox?: ConfirmCheckbox
}

interface ConfirmResult {
  ok: boolean
  checked: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<ConfirmResult>) | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [checked, setChecked] = useState(false)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setChecked(opts.checkbox?.defaultChecked ?? false)
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
          {pending?.checkbox && (
            <label className="label cursor-pointer justify-start gap-2 mt-1">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span className="label-text">{pending.checkbox.label}</span>
            </label>
          )}
          <div className="modal-action">
            <button className="btn" onClick={() => close(false)}>
              {pending?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`btn ${pending?.danger ? 'btn-error' : 'btn-primary'}`}
              onClick={() => close(true)}
            >
              {pending?.confirmLabel ?? 'Confirm'}
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
