import { useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'

interface DialogProps {
  title: string
  description: string
  submitText: string
  pending: boolean
  disabled: boolean
  error: string
  onClose(): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
  children: ReactNode
}

export function Dialog({ title, description, submitText, pending, disabled, error, onClose, onSubmit, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const titleId = useId()
  useEffect(() => {
    const active = document.activeElement
    const returnTo = active instanceof HTMLElement
      ? active.closest('.card-menu')?.querySelector<HTMLElement>('summary') ?? active : undefined
    ref.current?.showModal()
    return () => {
      if (returnTo?.isConnected) returnTo.focus()
      else if (returnTo?.dataset.focus) {
        const replacement = [...document.querySelectorAll<HTMLElement>('[data-focus]')]
          .find(node => node.dataset.focus === returnTo.dataset.focus)
        replacement?.focus()
      }
    }
  }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  return <dialog ref={ref} className="editor-dialog" aria-labelledby={titleId}
    onCancel={event => { if (pending) event.preventDefault() }} onClose={onClose}>
    <form className="editor-form" onSubmit={onSubmit}>
      <h2 id={titleId}>{title}</h2>
      <p className="muted">{description}</p>
      <fieldset className="dialog-fields" disabled={pending}>{children}</fieldset>
      <p className="dialog-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>
      <div className="dialog-actions">
        <button type="button" className="quiet" disabled={pending} onClick={onClose}>Cancel</button>
        <button type="submit" className="primary" disabled={disabled || pending}>{submitText}</button>
      </div>
    </form>
  </dialog>
}
