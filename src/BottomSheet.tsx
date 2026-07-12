import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Lightweight bottom sheet for in-context direct add (Manual Add V2). Keeps
 * Mike in the current job workspace: the sheet is visually attached to the
 * bottom of the screen, titled with the section/category context that launched
 * it, and closing returns to the untouched section state behind it. This is
 * deliberately not a routed page — no workspace state is lost.
 */
export default function BottomSheet({ title, onClose, onRecordInstead, children }: {
  title: string
  onClose: () => void
  // Optional "Prefer to say it?" escape hatch. It does not start a section
  // voice mode — it just closes the sheet, returning to the workspace where
  // the one global Record bar sits.
  onRecordInstead?: () => void
  children: ReactNode
}) {
  // Escape closes the sheet, matching the backdrop/× affordances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll while the sheet is open so the workspace behind stays put.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Portalled to <body>: the trigger can live deep inside cards whose
  // ancestors create stacking contexts, which would otherwise let workspace
  // content paint over the fixed sheet.
  return createPortal(
    // Backdrop click-to-dismiss duplicates the visible × button (keyboard users
    // have × and Escape); same pattern as the capture confirmation scrim.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      {/* No drag handle: swipe-to-dismiss is not implemented in the browser/PWA,
          so nothing should imply the gesture. Dismissal is ×, backdrop, Escape. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="bottom-sheet-head">
          <h2 className="bottom-sheet-title">{title}</h2>
          <button type="button" className="bottom-sheet-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="bottom-sheet-body">{children}</div>
        {onRecordInstead && (
          <p className="bottom-sheet-voice">
            <span aria-hidden="true">🎙</span> Prefer to say it?{' '}
            <button type="button" className="bottom-sheet-voice-link" onClick={onRecordInstead}>Record instead</button>
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
