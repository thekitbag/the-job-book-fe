import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Lightweight toast/confirmation surface. Its job here is to say, in Mike's
// terms, what a money action did to Money and to Budget — never a generic
// "Saved". A toast carries a title and one explanation line; both are shown.

export interface Toast {
  id: number
  title: string
  body: string
  tone: 'money' | 'plain'
}

type ShowToast = (toast: { title: string; body: string; tone?: Toast['tone'] }) => void

// Default is a no-op so a component that calls useToast() without a provider
// (e.g. an isolated unit test) simply shows no toast rather than throwing.
const ToastContext = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastContext)
}

const AUTO_DISMISS_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback<ShowToast>(({ title, body, tone = 'money' }) => {
    const id = nextId.current++
    setToasts(prev => [...prev, { id, title, body, tone }])
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className={`toast toast--${toast.tone}`} role="status">
      <div className="toast-text">
        <p className="toast-title">{toast.title}</p>
        <p className="toast-body">{toast.body}</p>
      </div>
      <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  )
}
