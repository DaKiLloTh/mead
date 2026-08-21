import React, { createContext, useCallback, useContext, useState } from 'react'

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog className={`modal ${pending ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">{pending?.title}</h3>
          {pending?.body && <p className="py-3 text-sm text-base-content/70">{pending.body}</p>}
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
